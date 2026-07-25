import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import {
  addDays,
  addMinutesToTime,
  minutesToTime,
  nowMinutes,
  timeToMinutes,
  todayStr,
} from '../lib/datetime'
import { db, pool } from './index'
import * as schema from './schema'

const SEED_EMAIL = 'admin@barbearia.com'
const SEED_PASSWORD = 'admin123'

async function main() {
  console.log('Removendo dados de seed anteriores (se existirem)…')
  await db.delete(schema.users).where(eq(schema.users.email, SEED_EMAIL))

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)

  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Lucas Oliveira',
      email: SEED_EMAIL,
      passwordHash,
      cpf: '123.456.789-09',
      phone: '11987654321',
      birthDate: '1989-07-22',
    })
    .returning()

  const [establishment] = await db
    .insert(schema.establishments)
    .values({
      ownerId: user.id,
      name: 'Barbearia Navalha de Ouro',
      slug: 'navalha-de-ouro',
      businessType: 'barbearia',
      // Sem isto a conta nasce como teste vencido (somente-leitura), já que
      // trialEndsAt null não concede mais acesso gravável.
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      phone: '11987654321',
      document: '12.345.678/0001-90',
      address: 'Av. Paulista, 1000 · Bela Vista, São Paulo/SP',
      cep: '01310-100',
      socials: {
        instagram: 'navalhadeouro',
        whatsapp: '11987654321',
      },
      paymentSettings: {
        cash: true,
        pix: true,
        debit: true,
        credit: { enabled: true, maxInstallments: 12 },
      },
      welcomeMessage:
        'Bem-vindo à Navalha de Ouro! Agende seu horário em poucos cliques e venha renovar o visual.',
      quiz: {
        teamSize: 'somente-eu',
        monthlyClients: '51-150',
        mainGoal: 'organizar-agenda',
        heardFrom: 'indicacao',
      },
    })
    .returning()

  await db.insert(schema.workingHours).values([
    { establishmentId: establishment.id, dayOfWeek: 0, opensAt: '09:00', closesAt: '18:00', isClosed: true },
    { establishmentId: establishment.id, dayOfWeek: 1, opensAt: '09:00', closesAt: '19:00', isClosed: false },
    { establishmentId: establishment.id, dayOfWeek: 2, opensAt: '09:00', closesAt: '19:00', isClosed: false },
    { establishmentId: establishment.id, dayOfWeek: 3, opensAt: '09:00', closesAt: '19:00', isClosed: false },
    { establishmentId: establishment.id, dayOfWeek: 4, opensAt: '09:00', closesAt: '19:00', isClosed: false },
    { establishmentId: establishment.id, dayOfWeek: 5, opensAt: '09:00', closesAt: '19:00', isClosed: false },
    { establishmentId: establishment.id, dayOfWeek: 6, opensAt: '09:00', closesAt: '18:00', isClosed: false },
  ])

  // O dono da conta também é um profissional (isOwner): aparece com a coroa,
  // não pode ser excluído e só tem jornada/status editáveis. Inserido primeiro,
  // como no cadastro real.
  await db.insert(schema.employees).values({
    establishmentId: establishment.id,
    name: user.name,
    isOwner: true,
    workStart: '09:00',
    workEnd: '19:00',
    workDays: [1, 2, 3, 4, 5, 6],
  })

  const [employee] = await db
    .insert(schema.employees)
    .values({
      establishmentId: establishment.id,
      name: 'Carlos Andrade',
      email: 'carlos.andrade@navalhadeouro.com',
      phone: '11991234567',
      birthDate: '1990-05-14',
      gender: 'masculino',
      workStart: '09:00',
      workEnd: '19:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      workDays: [1, 2, 3, 4, 5, 6],
      commissionEnabled: true,
      commissionType: 'percent',
    })
    .returning()

  // Profissionais adicionais para testes de agenda com múltiplos funcionários
  await db.insert(schema.employees).values([
    {
      establishmentId: establishment.id,
      name: 'Rafael Nunes',
      email: 'rafael.nunes@navalhadeouro.com',
      phone: '11990001111',
      birthDate: '1988-08-20',
      gender: 'masculino',
      workStart: '10:00',
      workEnd: '19:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      establishmentId: establishment.id,
      name: 'Marina Alves',
      email: 'marina.alves@navalhadeouro.com',
      phone: '11990002222',
      birthDate: '1995-02-11',
      gender: 'feminino',
      workStart: '09:00',
      workEnd: '18:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      workDays: [2, 3, 4, 5, 6],
    },
    {
      establishmentId: establishment.id,
      name: 'Diego Ramos',
      email: 'diego.ramos@navalhadeouro.com',
      phone: '11990003333',
      birthDate: '1992-11-30',
      gender: 'masculino',
      workStart: '08:00',
      workEnd: '17:00',
      workDays: [1, 2, 3, 4, 5],
    },
  ])

  const servicesData = [
    { name: 'Corte Masculino', durationMinutes: 30, priceCents: 4500 },
    { name: 'Barba Completa', durationMinutes: 30, priceCents: 3500 },
    { name: 'Corte + Barba', durationMinutes: 60, priceCents: 7000 },
    { name: 'Pezinho (Acabamento)', durationMinutes: 15, priceCents: 1500 },
    { name: 'Sobrancelha', durationMinutes: 15, priceCents: 1500 },
    { name: 'Luzes / Descoloração', durationMinutes: 90, priceCents: 12000 },
    { name: 'Relaxamento Capilar', durationMinutes: 60, priceCents: 8000, active: false },
  ]
  const services = await db
    .insert(schema.services)
    .values(servicesData.map((s) => ({ ...s, establishmentId: establishment.id })))
    .returning()
  const serviceByName = new Map(services.map((s) => [s.name, s]))

  // Comissão de exemplo do Carlos (porcentagem por serviço)
  const carlosCommissions: Record<string, number> = {
    'Corte Masculino': 40,
    'Barba Completa': 40,
    'Corte + Barba': 45,
    'Pezinho (Acabamento)': 50,
    'Sobrancelha': 50,
  }
  const commissionRows = Object.entries(carlosCommissions)
    .map(([name, value]) => {
      const svc = serviceByName.get(name)
      return svc ? { employeeId: employee.id, serviceId: svc.id, value } : null
    })
    .filter((row): row is { employeeId: string; serviceId: string; value: number } => row !== null)
  if (commissionRows.length > 0) {
    await db.insert(schema.employeeCommissions).values(commissionRows)
  }
  // Valor da comissão do Carlos por serviço, para apurar os atendimentos abaixo
  const carlosCommissionByServiceId = new Map(commissionRows.map((r) => [r.serviceId, r.value]))

  // Pacote de exemplo: Corte + Barba + Sobrancelha com 15% de desconto
  const comboItems = ['Corte Masculino', 'Barba Completa', 'Sobrancelha']
    .map((n) => serviceByName.get(n))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
  if (comboItems.length === 3) {
    const sumCents = comboItems.reduce((a, s) => a + s.priceCents, 0)
    const durationMinutes = comboItems.reduce((a, s) => a + s.durationMinutes, 0)
    const discountPct = 15
    await db.insert(schema.services).values({
      establishmentId: establishment.id,
      name: 'Combo Completo (Corte + Barba + Sobrancelha)',
      durationMinutes,
      priceCents: sumCents - Math.round((sumCents * discountPct) / 100),
      isPackage: true,
      packageServiceIds: comboItems.map((s) => s.id),
      packageDiscountType: 'percent',
      packageDiscountValue: discountPct,
    })
  }

  // Produtos para venda no balcão (estoque)
  await db.insert(schema.products).values([
    { establishmentId: establishment.id, name: 'Pomada Modeladora', brand: 'Don Alcides', priceCents: 3500, costCents: 1800, stockQuantity: 24, sku: 'POM-001' },
    { establishmentId: establishment.id, name: 'Shampoo Anticaspa', brand: 'QOD Barber', priceCents: 2800, costCents: 1500, stockQuantity: 15, sku: 'SHP-002' },
    { establishmentId: establishment.id, name: 'Óleo para Barba', brand: 'Viking', priceCents: 4200, costCents: 2200, stockQuantity: 8, sku: 'OLE-003' },
    { establishmentId: establishment.id, name: 'Minoxidil 5%', brand: 'Kirkland', priceCents: 6900, costCents: 3900, stockQuantity: 3, sku: 'MIN-004' },
    { establishmentId: establishment.id, name: 'Cera Fixadora', brand: 'Bem Barba', priceCents: 3200, costCents: 1600, stockQuantity: 0, sku: 'CER-005' },
  ])

  const clientsData = [
    { name: 'Fernando Costa', phone: '11991112233' },
    { name: 'Rafael Almeida', phone: '11992223344' },
    { name: 'Bruno Santos', phone: '11993334455' },
    { name: 'Diego Pereira', phone: '11994445566' },
    { name: 'Marcos Vinícius', phone: '11995556677' },
    { name: 'Thiago Rocha', phone: '11996667788' },
    { name: 'André Souza', phone: '11997778899' },
    { name: 'Gabriel Martins', phone: '11998889900' },
  ]
  const clients = await db
    .insert(schema.clients)
    .values(clientsData.map((c) => ({ ...c, establishmentId: establishment.id })))
    .returning()

  const today = todayStr()

  interface SeedAppointment {
    clientIndex: number
    serviceName: string
    dayOffset: number
    startTime: string
    status?: 'confirmed' | 'cancelled' | 'completed' | 'pending'
    createdVia?: 'panel' | 'public'
  }

  const pastAppointments: SeedAppointment[] = [
    { clientIndex: 0, serviceName: 'Corte Masculino', dayOffset: -13, startTime: '10:00', status: 'completed' },
    { clientIndex: 1, serviceName: 'Corte + Barba', dayOffset: -12, startTime: '14:00', status: 'completed', createdVia: 'public' },
    { clientIndex: 2, serviceName: 'Barba Completa', dayOffset: -11, startTime: '11:30', status: 'completed' },
    { clientIndex: 3, serviceName: 'Corte Masculino', dayOffset: -9, startTime: '16:00', status: 'completed', createdVia: 'public' },
    { clientIndex: 4, serviceName: 'Luzes / Descoloração', dayOffset: -8, startTime: '09:30', status: 'completed' },
    { clientIndex: 5, serviceName: 'Corte Masculino', dayOffset: -7, startTime: '15:00', status: 'cancelled' },
    { clientIndex: 6, serviceName: 'Corte + Barba', dayOffset: -6, startTime: '10:30', status: 'completed', createdVia: 'public' },
    { clientIndex: 7, serviceName: 'Sobrancelha', dayOffset: -5, startTime: '13:00', status: 'completed' },
    { clientIndex: 0, serviceName: 'Barba Completa', dayOffset: -4, startTime: '17:30', status: 'completed' },
    { clientIndex: 1, serviceName: 'Corte Masculino', dayOffset: -2, startTime: '09:00', status: 'completed', createdVia: 'public' },
    { clientIndex: 2, serviceName: 'Pezinho (Acabamento)', dayOffset: -1, startTime: '12:00', status: 'completed' },
  ]

  // Hoje: manhã (concluídos se já passaram) + horários futuros calculados a partir de agora
  const todayFixed: SeedAppointment[] = [
    { clientIndex: 3, serviceName: 'Corte Masculino', dayOffset: 0, startTime: '09:30' },
    { clientIndex: 4, serviceName: 'Barba Completa', dayOffset: 0, startTime: '11:00', createdVia: 'public' },
  ]

  const upcoming: SeedAppointment[] = []
  const firstFree = Math.min(Math.ceil((nowMinutes() + 60) / 30) * 30, 24 * 60)
  if (firstFree + 60 <= timeToMinutes('18:00')) {
    upcoming.push(
      { clientIndex: 5, serviceName: 'Corte + Barba', dayOffset: 0, startTime: minutesToTime(firstFree), createdVia: 'public' },
      { clientIndex: 6, serviceName: 'Corte Masculino', dayOffset: 0, startTime: minutesToTime(firstFree + 90) },
    )
  }

  const futureAppointments: SeedAppointment[] = [
    { clientIndex: 7, serviceName: 'Corte Masculino', dayOffset: 1, startTime: '10:00', createdVia: 'public' },
    { clientIndex: 0, serviceName: 'Corte + Barba', dayOffset: 1, startTime: '14:30' },
    { clientIndex: 2, serviceName: 'Barba Completa', dayOffset: 2, startTime: '11:00', createdVia: 'public' },
    { clientIndex: 4, serviceName: 'Corte Masculino', dayOffset: 3, startTime: '16:30' },
    { clientIndex: 1, serviceName: 'Luzes / Descoloração', dayOffset: 4, startTime: '09:30', createdVia: 'public' },
    // Agendamento pendente (aguardando aceite) para demonstrar o fluxo
    { clientIndex: 5, serviceName: 'Corte Masculino', dayOffset: 1, startTime: '17:00', status: 'pending', createdVia: 'public' },
  ]

  const allAppointments = [...pastAppointments, ...todayFixed, ...upcoming, ...futureAppointments]

  for (const item of allAppointments) {
    const service = serviceByName.get(item.serviceName)
    if (!service) continue
    const date = addDays(today, item.dayOffset)
    const isPastToday = item.dayOffset === 0 && timeToMinutes(item.startTime) < nowMinutes()
    const status =
      item.status ?? (item.dayOffset < 0 || isPastToday ? 'completed' : 'confirmed')
    const client = clients[item.clientIndex]
    const endTime = addMinutesToTime(item.startTime, service.durationMinutes)

    const [appointment] = await db
      .insert(schema.appointments)
      .values({
        establishmentId: establishment.id,
        clientId: client.id,
        serviceId: service.id,
        employeeId: employee.id,
        date,
        startTime: item.startTime,
        endTime,
        status,
        createdVia: item.createdVia ?? 'panel',
      })
      .returning()

    if (status === 'completed') {
      await db.insert(schema.transactions).values({
        establishmentId: establishment.id,
        appointmentId: appointment.id,
        description: `Serviço: ${service.name} · ${client.name}`,
        amountCents: service.priceCents,
        type: 'income',
        date,
      })

      // Comissão apurada (Carlos, percentual). Serviços sem regra (ex.: Luzes)
      // não geram comissão, replicando o comportamento do fechamento real.
      const commissionValue = carlosCommissionByServiceId.get(service.id)
      if (employee.commissionEnabled && commissionValue && commissionValue > 0) {
        await db.insert(schema.commissionEntries).values({
          establishmentId: establishment.id,
          appointmentId: appointment.id,
          employeeId: employee.id,
          serviceId: service.id,
          date,
          baseCents: service.priceCents,
          commissionType: employee.commissionType,
          commissionValue,
          commissionCents: Math.round((service.priceCents * commissionValue) / 100),
        })
      }
    }
  }

  const monthStart = `${today.slice(0, 7)}-01`
  await db.insert(schema.transactions).values([
    {
      establishmentId: establishment.id,
      description: 'Aluguel do espaço',
      amountCents: 180000,
      type: 'expense',
      date: monthStart,
    },
    {
      establishmentId: establishment.id,
      description: 'Produtos de barbearia (pomadas, lâminas)',
      amountCents: 25000,
      type: 'expense',
      date: addDays(today, -6),
    },
    {
      establishmentId: establishment.id,
      description: 'Conta de energia',
      amountCents: 18000,
      type: 'expense',
      date: addDays(today, -3),
    },
    {
      establishmentId: establishment.id,
      description: 'Venda de pomada modeladora',
      amountCents: 3500,
      type: 'income',
      date: addDays(today, -2),
    },
  ])

  console.log('')
  console.log('Seed concluído com sucesso!')
  console.log(`  Login:  ${SEED_EMAIL}`)
  console.log(`  Senha:  ${SEED_PASSWORD}`)
  console.log(`  Link público: http://localhost:5173/navalha-de-ouro`)
}

main()
  .catch((err) => {
    console.error('Falha no seed:', err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
