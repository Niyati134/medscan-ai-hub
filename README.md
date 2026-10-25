# 💊 MedScan AI Hub

**AI-Powered Prescription Scanning & Health Insights Platform**

MedScan AI Hub is a full-stack healthcare web application that helps users digitize prescriptions, explore medicine information, and interact with an AI-powered health assistant through a modern, user-friendly interface.

Built with React, TypeScript, TanStack Start, Supabase, and Google Gemini AI.

## ✨ Features

- **🔐 User Authentication** — Sign up, log in, and manage your account.
- **📄 Prescription Scanning** — Upload prescription images for AI-assisted analysis.
- **💊 Medicine Insights** — View extracted medicine details, uses, side effects, and related information.
- **🤖 AI Health Assistant** — Ask health-related questions through the integrated chatbot.
- **📊 Dashboard** — Access health-related information and application features from one place.
- **🗂️ Scan History** — Revisit previous scans.
- **👤 Profile Management** — Access and manage your profile information.
- **📈 Additional Tools** — Includes medicine price comparison, reminders, health insights, and other supporting features.
- **🎨 Modern Interface** — Responsive layout, reusable UI components, and theme support.

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript |
| Application Framework | TanStack Start |
| Styling & UI | Tailwind CSS, shadcn/ui |
| Authentication & Database | Supabase |
| AI Integration | Google Gemini API |
| Build Tool | Vite |
| Package Management | npm |

## ⚙️ Getting Started

### Prerequisites

- Node.js and npm
- A Supabase project
- A Google Gemini API key

### 1. Clone the repository

```bash
git clone https://github.com/Niyati134/medscan-ai-hub.git
cd medscan-ai-hub
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

Open `.env` and enter your own configuration values obtained from Supabase and Google AI Studio.

Keep all real API keys and credentials private. Never commit your `.env` file.

### 4. Configure Supabase

Review the SQL migrations in `supabase/migrations/` and apply the required migrations to a dedicated Supabase project using the appropriate Supabase migration workflow or SQL Editor.

Use a dedicated project for this application, and review database permissions and security policies before applying migrations to any existing database.

### 5. Start the development server

```bash
npm run dev
```

Open the local URL displayed in your terminal. The default development address is typically `http://localhost:8080`.

## 🔑 Environment Variables

Refer to `.env.example` for the required variable names and configuration.

The application uses Supabase configuration for authentication and data access, along with a server-side Gemini API key for AI functionality.

Use placeholder values in documentation. Never publish real credentials, service-role keys, or private API keys.

## 🗂️ Project Structure

```text
medscan-ai-hub/
├── drizzle/                  # Database schema and migrations
├── src/
│   ├── components/           # Reusable UI components
│   ├── hooks/                # Custom React hooks
│   ├── integrations/         # Supabase integrations
│   ├── lib/                  # Application and AI logic
│   └── routes/               # Application pages and routes
├── supabase/
│   └── migrations/           # Supabase SQL migrations
├── .env.example              # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

## 🔒 Security & Privacy

- Keep `.env` and all real API credentials out of version control.
- Keep privileged Supabase service-role credentials on the server only.
- Configure appropriate authentication, database access controls, and Row Level Security (RLS) policies.
- Review third-party AI processing and data-handling practices before using real or sensitive medical information.

## ⚠️ Medical Disclaimer

MedScan AI Hub is an educational and informational software project. AI-generated prescription interpretations and health information may be incomplete or incorrect and must not replace professional medical advice, diagnosis, or treatment.

Always verify prescription details with a qualified healthcare professional. Do not change medication or dosage based solely on AI-generated results.

## 👩‍💻 Author

**Niyati Chavan**

- GitHub: [@Niyati134](https://github.com/Niyati134)
- Project Repository: [MedScan AI Hub](https://github.com/Niyati134/medscan-ai-hub)

---

⭐ If you find this project interesting, consider starring the repository.