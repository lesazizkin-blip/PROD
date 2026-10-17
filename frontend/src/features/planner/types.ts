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

/** Шаг 1 AI-плана: уточняющие вопросы с вариантами ответа */
export interface PlanQuestion {
  id: string
  question: string
  options: string[]
}

export interface PlanAnswer {
  question: string
  answer: string
}
