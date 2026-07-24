import { and, asc, eq, ne } from 'drizzle-orm'
import { db } from '../../db'
import {
  appointments,
  clients,
  employees,
  establishments,
  services,
  timeBlocks,
  workingHours,
} from '../../db/schema'
import {
  addMinutesToTime,
  getDayOfWeek,
  nowMinutes,
  timeToMinutes,
  todayStr,
} from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { publish } from '../../lib/events'
import { lockEmployeeDay } from '../../lib/locks'
import { getAccessState } from '../../lib/plan'
import { computeAvailableSlots, isValidPhone, normalizePhone, timesOverlap } from '../../lib/slots'
import type { AvailabilityQuery, CreateBookingInput } from './schemas'

// Cor primária do design system (tailwind `primary`). É a cor da página pública
// no plano grátis, independente do themeColor guardado (que pode ter default legado).
const SYSTEM_PRIMARY = '#1E2F5E'

async function findEstablishmentBySlug(slug: string) {
  const establishment = await db.query.establishments.findFirst({
    where: eq(establishments.slug, slug),
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)
  return establishment
}

async function resolveEmployee(establishmentId: string, employeeId?: string) {
  if (employeeId) {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, employeeId),
        eq(employees.establishmentId, establishmentId),
        eq(employees.active, true),
      ),
    })
    if (!employee) throw new AppError('Profissional não encontrado', 404)
    return employee
  }
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.establishmentId, establishmentId), eq(employees.active, true)),
    orderBy: [asc(employees.createdAt)],
  })
  if (!employee) throw new AppError('Nenhum profissional disponível para agendamento', 404)
  return employee
}

async function findActiveService(establishmentId: string, serviceId: string) {
  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, serviceId),
      eq(services.establishmentId, establishmentId),
      eq(services.active, true),
    ),
  })
  if (!service) throw new AppError('Serviço não encontrado', 404)
  return service
}

export async function getPublicEstablishment(slug: string) {
  const establishment = await findEstablishmentBySlug(slug)

  const [allServices, activeEmployees, hours] = await Promise.all([
    db.query.services.findMany({
      where: eq(services.establishmentId, establishment.id),
      orderBy: [asc(services.name)],
    }),
    db.query.employees.findMany({
      where: and(eq(employees.establishmentId, establishment.id), eq(employees.active, true)),
      orderBy: [asc(employees.createdAt)],
    }),
    db.query.workingHours.findMany({
      where: eq(workingHours.establishmentId, establishment.id),
      orderBy: [asc(workingHours.dayOfWeek)],
    }),
  ])

  // Mapa de preços para calcular o valor "cheio" (sem desconto) dos pacotes
  const priceById = new Map(allServices.map((s) => [s.id, s.priceCents]))
  const activeServices = allServices.filter((s) => s.active)

  // Branding efetivo: o gate é resolvido aqui (no servidor), o front só
  // renderiza. Cor/banner/mensagem próprios valem enquanto a conta paga OU está
  // no teste grátis; free e teste expirado voltam pra cor do sistema + marca
  // Kairoon. Teste expirado sem assinatura → página não aceita agendamentos.
  const access = await getAccessState(establishment.id, establishment)
  const isPaid = access.state === 'paid' || access.state === 'trial'
  const branding = {
    brandColor: isPaid ? establishment.themeColor : SYSTEM_PRIMARY,
    // Paleta efetiva: no grátis/expirado volta ao sistema (null → defaults).
    palette: isPaid ? establishment.palette : null,
    bannerImageUrl: isPaid ? establishment.bannerImageUrl : null,
    showKairoonWatermark: !isPaid,
    footerMessage: isPaid ? establishment.footerMessage : null,
  }

  // Redes exibidas no link público: só as que têm valor E estão marcadas para
  // aparecer. Filtramos aqui (no servidor) para não expor um @/telefone oculto.
  const rawSocials = establishment.socials ?? {}
  const visibleSocials: { instagram?: string; whatsapp?: string } = {}
  if (establishment.showInstagram && rawSocials.instagram) {
    visibleSocials.instagram = rawSocials.instagram
  }
  if (establishment.showWhatsapp && rawSocials.whatsapp) {
    visibleSocials.whatsapp = rawSocials.whatsapp
  }
  const socials = visibleSocials.instagram || visibleSocials.whatsapp ? visibleSocials : null

  return {
    establishment: {
      id: establishment.id,
      name: establishment.name,
      slug: establishment.slug,
      logoUrl: establishment.logoUrl,
      themeColor: establishment.themeColor,
      welcomeMessage: establishment.welcomeMessage,
      businessType: establishment.businessType,
      // phone NÃO é exposto aqui: o link público não usa e vazaria o número
      // mesmo com o WhatsApp oculto (o handle do WhatsApp costuma ser o phone).
      socials,
      // false quando o dono está com o teste grátis expirado (somente-leitura).
      acceptingBookings: access.state !== 'trial_expired',
    },
    branding,
    services: activeServices.map((s) => {
      const fullPrice =
        s.isPackage && s.packageServiceIds
          ? s.packageServiceIds.reduce((sum, id) => sum + (priceById.get(id) ?? 0), 0)
          : 0
      return {
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceCents: s.priceCents,
        isPackage: s.isPackage,
        // Só expõe o preço cheio quando há economia real
        originalPriceCents: fullPrice > s.priceCents ? fullPrice : null,
      }
    }),
    employees: activeEmployees.map((e) => ({ id: e.id, name: e.name, photoUrl: e.photoUrl })),
    workingHours: hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      opensAt: h.opensAt,
      closesAt: h.closesAt,
      isClosed: h.isClosed,
    })),
  }
}

export async function getAvailability(slug: string, query: AvailabilityQuery) {
  const establishment = await findEstablishmentBySlug(slug)
  const service = await findActiveService(establishment.id, query.serviceId)
  const employee = await resolveEmployee(establishment.id, query.employeeId)

  if (query.date < todayStr()) return { employeeId: employee.id, slots: [] }

  // Profissional não atende neste dia da semana
  if (!employee.workDays.includes(getDayOfWeek(query.date))) {
    return { employeeId: employee.id, slots: [] }
  }

  const dayHours = await db.query.workingHours.findFirst({
    where: and(
      eq(workingHours.establishmentId, establishment.id),
      eq(workingHours.dayOfWeek, getDayOfWeek(query.date)),
    ),
  })
  if (!dayHours || dayHours.isClosed) return { employeeId: employee.id, slots: [] }

  // Interseção do expediente do estabelecimento com a jornada do profissional
  const opensAt = dayHours.opensAt > employee.workStart ? dayHours.opensAt : employee.workStart
  const closesAt = dayHours.closesAt < employee.workEnd ? dayHours.closesAt : employee.workEnd
  if (timeToMinutes(opensAt) >= timeToMinutes(closesAt)) {
    return { employeeId: employee.id, slots: [] }
  }

  const appointmentsBusy = await db.query.appointments.findMany({
    where: and(
      eq(appointments.establishmentId, establishment.id),
      eq(appointments.employeeId, employee.id),
      eq(appointments.date, query.date),
      ne(appointments.status, 'cancelled'),
    ),
    columns: { startTime: true, endTime: true },
  })
  const busy: { startTime: string; endTime: string }[] = [...appointmentsBusy]

  // Intervalo de almoço do profissional
  if (employee.lunchStart && employee.lunchEnd) {
    busy.push({ startTime: employee.lunchStart, endTime: employee.lunchEnd })
  }

  // Bloqueios (feriados/folgas) da data
  const blocks = await db.query.timeBlocks.findMany({
    where: and(eq(timeBlocks.establishmentId, establishment.id), eq(timeBlocks.date, query.date)),
  })
  for (const block of blocks) {
    if (!block.startTime || !block.endTime) return { employeeId: employee.id, slots: [] }
    busy.push({ startTime: block.startTime, endTime: block.endTime })
  }

  const slots = computeAvailableSlots({
    opensAt,
    closesAt,
    durationMinutes: service.durationMinutes,
    busy,
    minStartMinutes: query.date === todayStr() ? nowMinutes() + 1 : undefined,
  })

  return { employeeId: employee.id, slots }
}

export async function createPublicBooking(slug: string, input: CreateBookingInput) {
  const establishment = await findEstablishmentBySlug(slug)

  // Booking público é uma escrita SEM JWT: por isso o gate de somente-leitura
  // (hook global em app.ts) não a alcança e precisamos barrar aqui: dono com o
  // teste grátis expirado (e sem assinatura) não recebe novos agendamentos.
  const access = await getAccessState(establishment.id, establishment)
  if (access.state === 'trial_expired') {
    throw new AppError('Este estabelecimento não está aceitando agendamentos no momento.', 403)
  }

  const service = await findActiveService(establishment.id, input.serviceId)
  const employee = await resolveEmployee(establishment.id, input.employeeId)

  const endTime = addMinutesToTime(input.startTime, service.durationMinutes)

  const dayHours = await db.query.workingHours.findFirst({
    where: and(
      eq(workingHours.establishmentId, establishment.id),
      eq(workingHours.dayOfWeek, getDayOfWeek(input.date)),
    ),
  })
  if (!dayHours || dayHours.isClosed) {
    throw new AppError('O estabelecimento não atende neste dia', 400)
  }
  if (
    timeToMinutes(input.startTime) < timeToMinutes(dayHours.opensAt) ||
    timeToMinutes(endTime) > timeToMinutes(dayHours.closesAt)
  ) {
    throw new AppError('Horário fora do expediente', 400)
  }

  // Jornada do profissional (dia, horário e almoço)
  if (!employee.workDays.includes(getDayOfWeek(input.date))) {
    throw new AppError('O profissional não atende neste dia', 400)
  }
  if (
    timeToMinutes(input.startTime) < timeToMinutes(employee.workStart) ||
    timeToMinutes(endTime) > timeToMinutes(employee.workEnd)
  ) {
    throw new AppError('Horário fora da jornada do profissional', 400)
  }
  if (
    employee.lunchStart &&
    employee.lunchEnd &&
    timesOverlap(input.startTime, endTime, employee.lunchStart, employee.lunchEnd)
  ) {
    throw new AppError('Horário indisponível (intervalo de almoço)', 400)
  }

  // Bloqueios (feriados/folgas)
  const blocks = await db.query.timeBlocks.findMany({
    where: and(eq(timeBlocks.establishmentId, establishment.id), eq(timeBlocks.date, input.date)),
  })
  for (const block of blocks) {
    if (
      !block.startTime ||
      !block.endTime ||
      timesOverlap(input.startTime, endTime, block.startTime, block.endTime)
    ) {
      throw new AppError('Este horário está indisponível (feriado ou folga)', 400)
    }
  }

  const today = todayStr()
  if (input.date < today || (input.date === today && timeToMinutes(input.startTime) <= nowMinutes())) {
    throw new AppError('Não é possível agendar em um horário que já passou', 400)
  }

  if (!isValidPhone(input.client.phone)) throw new AppError('Telefone inválido', 400)
  const phone = normalizePhone(input.client.phone)
  const email = input.client.email?.trim() || null
  const birthDate = input.client.birthDate || null
  const gender = input.client.gender || null

  // Confirma na hora ou deixa pendente até o estabelecimento aceitar
  const status = establishment.autoConfirm ? 'confirmed' : 'pending'

  const result = await db.transaction(async (tx) => {
    // Serializa reservas deste profissional+dia e revalida o conflito:
    // outro cliente pode ter reservado o mesmo horário entre a listagem
    // e a confirmação.
    await lockEmployeeDay(tx, employee.id, input.date)

    const existing = await tx
      .select({ startTime: appointments.startTime, endTime: appointments.endTime })
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishment.id),
          eq(appointments.employeeId, employee.id),
          eq(appointments.date, input.date),
          ne(appointments.status, 'cancelled'),
        ),
      )

    const hasConflict = existing.some((a) =>
      timesOverlap(input.startTime, endTime, a.startTime, a.endTime),
    )
    if (hasConflict) {
      throw new AppError('Este horário acabou de ser reservado. Escolha outro horário.', 409)
    }

    let client = await tx.query.clients.findFirst({
      where: and(eq(clients.establishmentId, establishment.id), eq(clients.phone, phone)),
    })
    if (!client) {
      // onConflictDoNothing: duas reservas simultâneas com o mesmo telefone
      // novo não podem estourar o índice único com erro 500.
      const [created] = await tx
        .insert(clients)
        .values({
          establishmentId: establishment.id,
          name: input.client.name.trim(),
          phone,
          email,
          birthDate,
          gender,
        })
        .onConflictDoNothing()
        .returning()
      client =
        created ??
        (await tx.query.clients.findFirst({
          where: and(eq(clients.establishmentId, establishment.id), eq(clients.phone, phone)),
        }))
    } else {
      // Completa dados do cliente já cadastrado, se informados agora
      const patch: Partial<typeof clients.$inferInsert> = {}
      if (email && client.email !== email) patch.email = email
      if (birthDate && client.birthDate !== birthDate) patch.birthDate = birthDate
      if (gender && client.gender !== gender) patch.gender = gender
      if (Object.keys(patch).length > 0) {
        await tx.update(clients).set(patch).where(eq(clients.id, client.id))
      }
    }
    if (!client) throw new AppError('Não foi possível registrar o cliente', 500)

    const [appointment] = await tx
      .insert(appointments)
      .values({
        establishmentId: establishment.id,
        clientId: client.id,
        serviceId: service.id,
        employeeId: employee.id,
        date: input.date,
        startTime: input.startTime,
        endTime,
        status,
        createdVia: 'public',
      })
      .returning()

    return {
      appointment,
      client: { id: client.id, name: client.name, phone: client.phone },
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
      },
      employee: { id: employee.id, name: employee.name },
      establishment: {
        name: establishment.name,
        slug: establishment.slug,
        phone: establishment.phone,
      },
    }
  })

  // Notifica o painel em tempo real quando o agendamento fica pendente
  if (result.appointment.status === 'pending') {
    publish(establishment.id, {
      type: 'pending-appointment',
      appointment: {
        id: result.appointment.id,
        date: result.appointment.date,
        startTime: result.appointment.startTime,
        endTime: result.appointment.endTime,
        clientName: result.client.name,
        clientPhone: result.client.phone,
        serviceName: result.service.name,
        servicePriceCents: result.service.priceCents,
        employeeName: result.employee.name,
      },
    })
  }

  return result
}

export async function identifyClient(slug: string, rawPhone: string) {
  const establishment = await findEstablishmentBySlug(slug)
  const phone = normalizePhone(rawPhone)
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.establishmentId, establishment.id), eq(clients.phone, phone)),
  })
  return { client: client ? { name: client.name } : null }
}
