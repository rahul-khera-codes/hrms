# TimeTrack — Clock-In / Clock-Out & Payroll

A professional, SaaS-style frontend for employee time tracking and admin payroll management.

## Features

- **Employee**
  - Clock in / clock out with live time display
  - Dashboard with period summary (regular, overtime, night hours)
  - My Sessions: full history with regular/overtime breakdown
- **Admin**
  - Dashboard: present/absent today, employees, pending adjustments
  - Attendance: searchable/filterable table, export, edit actions
  - Payroll: set period, calculate, view totals, export CSV/PDF
  - Reports: attendance or payroll summary, date range, export
  - Settings: payroll rules (regular, overtime, night multipliers), integrations placeholder

## Tech stack

- React 18 + TypeScript
- Vite 7
- React Router 7
- Tailwind CSS 3
- Lucide React icons
- date-fns, clsx

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Login (demo)

- **Any email** and **any password**
- Choose **Employee** or **Admin** on the login form to switch roles.

## Build

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  contexts/     # Auth (mock user + role)
  layouts/      # EmployeeLayout, AdminLayout (sidebar + outlet)
  pages/        # Login, employee/*, admin/*
  data/         # Mock sessions, payroll, attendance
  types/        # ClockSession, PayrollSummary, AttendanceRecord, etc.
```

The UI is ready for backend integration: replace mock data and auth with your REST API when the backend is available.
