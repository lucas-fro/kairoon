import { ServicesTab } from '../../components/settings/ServicesTab'
import { PageHeader } from '../../components/ui/PageHeader'

export function ServicesPage() {
  return (
    <div className="w-full">
      <PageHeader title="Serviços" />
      <ServicesTab />
    </div>
  )
}
