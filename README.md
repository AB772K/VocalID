# 🔐 VocalID: Intelligent Voice Authentication System

### Featuring Spoofing Prevention & Liveness Detection

Developed by **Abdul Basit (FA22-BCS-056)** & **Farrukh Zia (FA22-BCS-157)**

---

## 📖 Overview

**VocalID** is a full-stack voice biometric platform that combines speaker verification, automatic speech recognition, and deepfake detection into a single, production-ready web application.

Built as a Final Year Project, VocalID secures user login and automates hybrid-workforce attendance using randomised voice prompts, eliminating buddy punching, replay attacks, and AI-generated voice spoofing.

---

## 🔐 Key Features

- Multi-factor authentication:
  - Text Verification (Whisper ASR)
  - Voice Verification (ECAPA-TDNN)
  - Anti-Spoofing Detection (Fine-tuned wav2vec2)
- Randomised attendance prompts every 45–75 minutes
- Audible attendance alarm system
- 3-retry mechanism with fresh phrases on each attempt
- Manager Dashboard for user management, logs, and CSV exports
- User Dashboard for enrollment and attendance history
- Automated email alerts for consecutive missed verifications
- Spoof Detection Equal Error Rate (EER): **1.87%**
- Composite Authentication Accuracy: **96.6%**

---

## ⚙️ Tech Stack

### Frontend
- React

### Backend
- FastAPI (Python)

### Database
- MySQL

### Machine Learning Models
- OpenAI Whisper
- SpeechBrain ECAPA-TDNN
- Hugging Face wav2vec2 (Fine-tuned on EchoFake)

### Audio Processing
- Librosa
- FFmpeg

### Deployment
- Docker
- Uvicorn
- Nginx

---

## 👨‍💻 Team

### Abdul Basit
- AI Integration
- Backend Development
- Model Fine-Tuning
- Anti-Spoofing System
- Deployment

### Farrukh Zia
- Frontend Development
- Database Design
- Attendance Logic
- AI Integration

---

## 🏫 University

COMSATS University Islamabad, Wah Campus

---

## 📌 Project Status

This project is 100% complete and was developed with a strong focus on real-world deployability.

Potential extensions include:

- Remote Exam Proctoring
- Secure Banking Authentication
- Helpdesk Verification Systems

---

## 🐳 Docker Deployment

### Frontend Image
https://hub.docker.com/repository/docker/ab772k/vocalid-frontend/general

### Backend Image
https://hub.docker.com/repository/docker/ab772k/vocalid-backend/general
