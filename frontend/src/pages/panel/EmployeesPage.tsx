import { EmployeesTab } from '../../components/settings/EmployeesTab'
import { PageHeader } from '../../components/ui/PageHeader'

export function EmployeesPage() {
  return (
    <div className="w-full">
      <PageHeader title="Profissionais" />
      <EmployeesTab />
    </div>
  )
}
