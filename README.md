🔐 **VocalID: Intelligent Voice Authentication System** Featuring **Spoofing Prevention & Liveness Detection** Developed by **Abdul Basit (FA22-BCS-056)** & **Farrukh Zia (FA22-BCS-157)**


**VocalID** is a full‑stack voice biometric platform that combines speaker verification, automatic speech recognition, and deepfake detection into a single, production‑ready web application. Built as a Final Year Project, VocalID secures user login and automates hybrid‑workforce attendance using randomised voice prompts – eliminating buddy punching, replay attacks, and AI‑generated voice spoofing.

🔐 **Key Features:**
• Multi‑factor authentication: Text (Whisper) + Voice (ECAPA‑TDNN) + Anti‑spoofing (fine‑tuned wav2vec2)
• Randomised attendance prompts every 45–75 minutes with audible alarm
• 3‑retry mechanism with fresh phrases each attempt
• Dual dashboards: Manager (user management, logs, CSV export) and User (enrollment, attendance history)
• Automated email alerts for consecutive missed verifications
• Spoof detection Equal Error Rate (EER): 1.87% 
• Composite authentication accuracy: 96.6%

⚙️ **Tech Stack:**
Frontend: React | Backend: FastAPI (Python) | Database: MySQL
ML Models: OpenAI Whisper, SpeechBrain ECAPA‑TDNN, Hugging Face wav2vec2 (fine‑tuned on EchoFake)
Audio: Librosa, FFmpeg | Deployment: Docker, Uvicorn, Nginx

👨‍💻 **Team:**
Abdul Basit – AI Integration, Model Fine‑Tuning, Anti‑Spoofing
Farrukh Zia – Backend, Frontend, Database, Deployment, Attendance Logic

🏫 **University:**
COMSATS University Islamabad, Wah Campus

📌 This project is 100% complete and was developed with a strong focus on real‑world deployability. The system can be extended to remote exam proctoring, secure banking, or helpdesk verification.

We Uploaded This To Docker To Run From AZURE VM For Deployment:
https://hub.docker.com/repository/docker/ab772k/vocalid-frontend/general
https://hub.docker.com/repository/docker/ab772k/vocalid-backend/general
