import type { PublicEstablishment } from '../../types/api'

export type PublicService = PublicEstablishment['services'][number]
export type PublicEmployee = PublicEstablishment['employees'][number]

export type WizardStep =
  | 'welcome'
  | 'service'
  | 'employee'
  | 'date'
  | 'time'
  | 'client'
  | 'confirm'
  | 'success'
