export type UserRole = 'student' | 'mentor' | 'teacher' | 'admin'

export interface UserProfile {
  uid: string
  role: UserRole
  nickname: string
  schoolId?: string
  teamId?: string
  assignedStudentIds?: string[]
  active: boolean
}

export interface ActivityResponse {
  programId: string
  sessionId: string
  userId: string
  status: 'draft' | 'submitted'
  answers: Record<string, unknown>
  updatedAt: unknown
}

export interface MentorFeedback {
  programId: string
  sessionId: string
  studentId: string
  mentorId: string
  message: string
  createdAt: unknown
}
