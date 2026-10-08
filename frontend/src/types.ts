export type Status = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected'
export type Action = 'submit' | 'approve' | 'reject' | 'request_changes'

export interface User {
  id: number
  email: string
  full_name: string
  role: 'user' | 'admin'
}

export interface Item {
  id: number
  title: string
  description: string
  amount: number
  status: Status
  owner_id: number
  owner_name: string
  created_at: string
  updated_at: string
}

export interface ItemList {
  items: Item[]
  total: number
  limit: number
  offset: number
}

export interface ItemEvent {
  id: number
  actor_name: string
  action: string
  from_status: Status | null
  to_status: Status
  comment: string | null
  created_at: string
}

export interface FieldError {
  field: string
  message: string
}
