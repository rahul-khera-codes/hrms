// 10JUN2026 client video Item 10 — Orlando: the Scheduler's bulk-assign
// dialog needs to accept the same Task field that already exists on the
// per-record Attendance form. Extracted the shared task list here so
// both the Attendance form and the Scheduler panel reference the same
// canonical list (and so future task additions land in one place).

export const TASK_OPTIONS = [
  'Admin',
  'Authorizations',
  'Billing Support',
  'Call Center',
  'CDPAP Prebilling',
  'Care Manager',
  'Collections',
  'Coord Support',
  'Coordination',
  'COVID Screening',
  'Cross Training',
  'Customer Support',
  'Data Entry',
  'Document Coord',
  'EVV',
  'Floater',
  'Flu Shot',
  'Follow ups',
  'Help Desk',
  'HHAX App',
  'HR Project',
  'HR Support',
  'Inflowcare',
  'Intake Support',
  'Lead Generator',
  'LIHTC Support',
  'Medical Billing',
  'Nursing Support',
  'On Call',
  'Operator',
  'Pre-Billing',
  'Property Mgmt',
  'Receptionist',
  'Recruitment',
  'Sales Support',
  'Service Follow up',
  'Special Project',
  'Staffing',
  'VOC Surveys',
  'Sales Support T1',
  'OB Sales',
  'Junior Trainer',
  'Senior Trainer',
  'Accountant',
] as const

export type TaskOption = typeof TASK_OPTIONS[number]
