import type { Stage } from '../../api/types'

export interface PlanTask {
  title: string
  stage: Stage
  offset_days: number
}

export interface PersonalPlan {
  tasks: PlanTask[]
  first_day: string[]
}
