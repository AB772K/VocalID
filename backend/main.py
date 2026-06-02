from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
import librosa
from pydantic import BaseModel, validator
import mysql.connector
from typing import Optional, List
import re
import hashlib
import os
import uuid
from datetime import datetime
import random
import json
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import whisper
import Levenshtein
import shutil
import subprocess
import numpy as np
import soundfile as sf  # added for saving preprocessed audio

from speaker_embedding import extract_embedding
from spoof_detector import detect_spoof

app = FastAPI(
    title="VocalID API",
    description="Intelligent Voice Authentication System with Spoof & Liveness Detection",
    version="1.0.0",
    contact={
        "name": "VocalID Team",
        "url": "http://localhost:8000",
    },
    docs_url="/docs",
    redoc_url="/redoc",
)

# ==========================
# CORS CONFIGURATION
# ==========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================
# EMAIL CONFIGURATION
# ==========================
EMAIL_CONFIG = {
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587,
    "sender_email": "vocalidmanager@gmail.com",
    "sender_password": "dvjdrvcfqtcrolvu"
}

ATTENDANCE_MIN_INTERVAL_SECONDS = 2700
ATTENDANCE_MAX_INTERVAL_SECONDS = 4500

# ==========================
# AUDIO PREPROCESSING (for consistency)
# ==========================
def preprocess_audio(file_path: str, target_sr: int = 16000, max_duration_sec: float = 8.0) -> np.ndarray:
    """
    Load audio, trim silence, normalize volume, and truncate to max duration.
    Returns a float32 numpy array suitable for both Whisper and embedding extraction.
    """
    try:
        audio, sr = librosa.load(file_path, sr=target_sr, mono=True)
        # Trim leading/trailing silence
        audio, _ = librosa.effects.trim(audio, top_db=30)
        # Truncate to max duration
        max_len = int(target_sr * max_duration_sec)
        if len(audio) > max_len:
            audio = audio[:max_len]
        # Peak normalize to 0.95
        peak = np.max(np.abs(audio)) + 1e-8
        audio = audio / peak * 0.95
        print(f"🔧 Audio preprocessed: {len(audio)} samples, peak={peak:.3f}")
        return audio.astype(np.float32)
    except Exception as e:
        print(f"⚠️ Audio preprocessing failed, returning empty: {e}")
        return np.zeros(1, dtype=np.float32)

def preprocess_and_save_temp(input_path: str) -> str:
    """
    Preprocess the audio and save to a temporary WAV file.
    Returns the path to the cleaned temporary file.
    """
    audio_array = preprocess_audio(input_path)
    temp_path = input_path + "_cleaned.wav"
    sf.write(temp_path, audio_array, 16000)
    return temp_path

def extract_embedding_from_preprocessed_file(file_path: str) -> np.ndarray:
    """
    Preprocess audio and extract ECAPA-TDNN embedding using a temporary cleaned file.
    This ensures embedding extraction uses the exact same audio as Whisper.
    """
    # Preprocess audio array
    audio_array = preprocess_audio(file_path)
    # Save to temporary file
    temp_file = file_path + "_preprocessed.wav"
    try:
        sf.write(temp_file, audio_array, 16000)
        # Call original embedding extractor on the temp file
        embedding = extract_embedding(temp_file)
        return embedding
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

# ==========================
# WHISPER MODEL LOADING
# ==========================
print("🔊 Loading Whisper model...")
whisper_model = whisper.load_model("base")
print("✅ Whisper model loaded successfully!")

# ==========================
# DATABASE CONNECTION (IMPROVED)
# ==========================
def get_db_connection():
    max_retries = 3
    for attempt in range(max_retries):
        try:
            conn = mysql.connector.connect(
                host=os.getenv("DB_HOST", "localhost"),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASSWORD", ""),
                database=os.getenv("DB_NAME", "vocalid_db"),
                autocommit=False
            )
            return conn
        except mysql.connector.Error as e:
            if attempt < max_retries - 1:
                print(f"⚠️ Database connection failed (attempt {attempt + 1}), retrying...: {e}")
                time.sleep(1)
            else:
                print(f"❌ Database connection failed after {max_retries} attempts: {e}")
                raise e

def get_db():
    return get_db_connection()

# ==========================
# PASSWORD HASHING (SHA256)
# ==========================
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hashlib.sha256(plain_password.encode('utf-8')).hexdigest() == hashed_password

# ==========================
# EMAIL SENDING FUNCTION
# ==========================
def send_welcome_email(user_id: int, full_name: str, email: str):
    """Send real welcome email to the user with their User ID"""
    try:
        message = MIMEMultipart()
        message["From"] = EMAIL_CONFIG["sender_email"]
        message["To"] = email
        message["Subject"] = "Welcome to VocalID - Your Account Information"
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">🎤 Welcome to VocalID!</h1>
                </div>
                
                <div style="padding: 30px;">
                    <h2 style="color: #333;">Hi {full_name},</h2>
                    
                    <p>Your VocalID voice authentication account has been successfully created!</p>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #333;">Your Account Information:</h3>
                        <p style="margin: 10px 0;"><strong>Full Name:</strong> {full_name}</p>
                        <p style="margin: 10px 0;"><strong>Email:</strong> {email}</p>
                        <p style="margin: 10px 0;"><strong>User ID:</strong> <span style="font-size: 18px; font-weight: bold; color: #667eea;">{user_id}</span></p>
                    </div>
                    
                    <p><strong>Important:</strong> Please save your User ID securely. You will need it every time you login.</p>
                    
                    <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #0066cc;">How to Login:</h4>
                        <ol style="margin: 10px 0; padding-left: 20px;">
                            <li>Go to: <a href="http://localhost:3000/voice-login" style="color: #667eea;">VocalID Login Page</a></li>
                            <li>Enter your User ID: <strong>{user_id}</strong></li>
                            <li>Follow the voice authentication process</li>
                            <li>Speak the prompted phrase to verify your identity</li>
                        </ol>
                    </div>
                    
                    <p><strong>Voice Authentication Tips:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Speak clearly and naturally</li>
                        <li>Use the same voice tone as during enrollment</li>
                        <li>Ensure you're in a quiet environment</li>
                        <li>Use the same microphone if possible</li>
                    </ul>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="http://localhost:3000/voice-login" 
                           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                  color: white; 
                                  padding: 12px 30px; 
                                  text-decoration: none; 
                                  border-radius: 5px; 
                                  font-weight: bold;
                                  display: inline-block;">
                            🎤 Login to VocalID
                        </a>
                    </div>
                    
                    <p>If you have any questions or need assistance, please contact your system administrator.</p>
                    
                    <p>Best regards,<br>
                    <strong>The VocalID Team</strong></p>
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">
                        This is an automated message. Please do not reply to this email.<br>
                        VocalID Voice Authentication System
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        message.attach(MIMEText(body, "html"))
        
        with smtplib.SMTP(EMAIL_CONFIG["smtp_server"], EMAIL_CONFIG["smtp_port"]) as server:
            server.starttls()
            server.login(EMAIL_CONFIG["sender_email"], EMAIL_CONFIG["sender_password"])
            server.send_message(message)
        
        print(f"✅ REAL EMAIL SENT TO: {email}")
        print(f"✅ USER ID: {user_id}")
        
        return {
            "success": True,
            "to": email,
            "user_id": user_id,
            "message": "Welcome email sent successfully"
        }
        
    except Exception as e:
        print(f"❌ EMAIL SENDING FAILED: {str(e)}")
        return {
            "success": False,
            "to": email,
            "user_id": user_id,
            "error": str(e)
        }

def simulate_email_sending(user_id: int, full_name: str, email: str):
    """Fallback email simulation if real email fails"""
    print(f"📧 SIMULATED EMAIL SENT TO: {email}")
    print(f"📧 USER ID: {user_id}")
    print(f"📧 MESSAGE: Hi {full_name}, welcome to VocalID! Your User ID is: {user_id}")
    return {
        "simulated": True,
        "to": email,
        "user_id": user_id,
        "message": "Email simulation completed"
    }


def generate_attendance_interval_seconds() -> int:
    return random.randint(ATTENDANCE_MIN_INTERVAL_SECONDS, ATTENDANCE_MAX_INTERVAL_SECONDS)


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone().replace(tzinfo=None)
        return parsed
    except Exception:
        return None


def send_attendance_alert(user_id: int, missed_timestamps: List[str]):
    """Send attendance alert email ONLY to fixed email."""

    db = get_db_connection()
    cursor = db.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT full_name
            FROM users
            WHERE user_id = %s
        """, (user_id,))

        details = cursor.fetchone()

        if not details:
            print(f"⚠️ User {user_id} not found")
            return {"success": False, "error": "User not found"}

        user_name = details.get("full_name") or f"User {user_id}"

        missed_list_html = "".join(
            [f"<li>{timestamp}</li>" for timestamp in missed_timestamps]
        )

        # ✅ ONLY THIS EMAIL WILL RECEIVE ALERT
        recipients = ["basitzahid0@gmail.com"]

        message = MIMEMultipart()
        message["From"] = EMAIL_CONFIG["sender_email"]
        message["To"] = ", ".join(recipients)
        message["Subject"] = "Attendance Alert"

        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
            <h2>Attendance Alert</h2>
            <p>
                User <strong>{user_name}</strong> (ID: <strong>{user_id}</strong>)
                has missed two consecutive attendance voice verifications.
            </p>
            <p>Missed verification times:</p>
            <ul>{missed_list_html}</ul>
        </body>
        </html>
        """

        message.attach(MIMEText(body, "html"))

        with smtplib.SMTP(EMAIL_CONFIG["smtp_server"], EMAIL_CONFIG["smtp_port"]) as server:
            server.starttls()
            server.login(EMAIL_CONFIG["sender_email"], EMAIL_CONFIG["sender_password"])
            server.send_message(message, to_addrs=recipients)

        print(f"✅ Attendance alert sent to {recipients}")
        return {"success": True, "to": recipients}

    except Exception as e:
        print(f"❌ Failed to send attendance alert: {str(e)}")
        return {"success": False, "error": str(e)}

    finally:
        cursor.close()
        db.close()

# ==========================
# MODELS
# ==========================
class ManagerLogin(BaseModel):
    username: str
    password: str

class ManagerResponse(BaseModel):
    manager_id: int
    full_name: str
    message: str

class UserRegistration(BaseModel):
    full_name: str
    email: str
    created_by: int

    @validator('full_name')
    def validate_full_name(cls, v):
        if not v.strip():
            raise ValueError('Full name cannot be empty')
        if len(v.strip()) < 2:
            raise ValueError('Full name must be at least 2 characters')
        if len(v.strip()) > 100:
            raise ValueError('Full name must be less than 100 characters')
        if not re.match(r"^[a-zA-Z\s\-'.]+$", v):
            raise ValueError('Full name can only contain letters, spaces, hyphens, and apostrophes')
        return v.strip()

    @validator('email')
    def validate_email(cls, v):
        if not v.strip():
            raise ValueError('Email cannot be empty')
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Invalid email format')
        return v.strip()

class UserUpdate(BaseModel):
    full_name: str

    @validator('full_name')
    def validate_full_name(cls, v):
        if not v.strip():
            raise ValueError('Full name cannot be empty')
        if len(v.strip()) < 2:
            raise ValueError('Full name must be at least 2 characters')
        if len(v.strip()) > 100:
            raise ValueError('Full name must be less than 100 characters')
        if not re.match(r"^[a-zA-Z\s\-'.]+$", v):
            raise ValueError('Full name can only contain letters, spaces, hyphens, and apostrophes')
        return v.strip()

class UserResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    message: str

class UserWithVoiceCreation(BaseModel):
    full_name: str
    email: str
    created_by: int

# ==========================
# AUDIO UPLOAD SETTINGS
# ==========================
AUDIO_UPLOAD_DIR = "uploads/audio"
os.makedirs(AUDIO_UPLOAD_DIR, exist_ok=True)


# ==========================
# EASY WORD LISTS FOR PHRASE GENERATION
# ==========================
EASY_COLORS    = ["red", "blue", "green", "pink", "black", "white", "brown", "orange", "yellow", "grey"]
EASY_ANIMALS   = ["cat", "bird", "fish", "cow", "duck", "lion", "bear", "sheep"]
EASY_OBJECTS   = ["book", "door", "chair", "cup", "key", "ball", "box", "car", "pen"]
EASY_ACTIONS   = ["run", "jump", "open", "stop", "walk", "find", "take", "hold", "bring"]
EASY_PLACES    = ["park", "school", "road", "lake", "farm", "shop", "room", "yard", "hill"]


# ==========================
# FRIENDLYWORDS PHRASE GENERATION
# ==========================
def generate_pronounceable_phrase():
    try:
        color   = random.choice(EASY_COLORS)
        animal  = random.choice(EASY_ANIMALS)
        obj     = random.choice(EASY_OBJECTS)
        action  = random.choice(EASY_ACTIONS)
        place   = random.choice(EASY_PLACES)
        num1    = random.randint(10, 99)
        num2    = random.randint(10, 99)

        patterns = [
            f"{num1} {color} {animal} {action} {num2}",
            f"{color} {animal} {action} {num1}",
            f"{num1} {animal} {action} {color} {num2}",
        ]

        phrase = random.choice(patterns)
        print(f"🎯 Generated phrase (easy): {phrase}")
        return phrase

    except Exception as e:
        print(f"⚠️ Phrase generation failed, using fallback: {e}")
        return generate_enhanced_fallback_phrase()


def generate_enhanced_fallback_phrase():
    color   = random.choice(EASY_COLORS)
    animal  = random.choice(EASY_ANIMALS)
    action  = random.choice(EASY_ACTIONS)
    num1    = random.randint(10, 99)
    num2    = random.randint(10, 99)

    phrase = f"{num1} {color} {animal} {action} {num2}"
    print(f"🎯 Generated phrase (fallback): {phrase}")
    return phrase

def generate_random_phrase():
    return generate_pronounceable_phrase()

# ==========================
# AUDIO CONVERSION UTILITIES
# ==========================
def convert_audio_to_wav(input_path: str, output_path: str = None) -> str:
    try:
        if output_path is None:
            output_path = input_path.replace('.webm', '.wav').replace('.mp3', '.wav').replace('.m4a', '.wav')
        cmd = [
            'ffmpeg', '-i', input_path,
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"⚠️ FFmpeg conversion failed: {result.stderr}")
            return input_path
        print(f"✅ Audio converted to WAV: {output_path}")
        return output_path
    except Exception as e:
        print(f"⚠️ Audio conversion failed: {e}")
        return input_path

def is_audio_file_readable(file_path: str) -> bool:
    try:
        y, sr = librosa.load(file_path, sr=None, mono=True)
        if len(y) > 0:
            print(f"✅ Audio file is readable: {len(y)} samples, {sr} Hz")
            return True
    except Exception as e:
        print(f"❌ Audio file not readable by librosa: {e}")
    return False

# ==========================
# TEXT VERIFICATION
# ==========================
def verify_text_match(original_phrase, spoken_text, confidence_threshold=0.40):
    if not spoken_text or not original_phrase:
        return 0.0, False, {"error": "Missing text"}
    original_clean = original_phrase.lower().strip()
    spoken_clean = spoken_text.lower().strip()
    distance = Levenshtein.distance(original_clean, spoken_clean)
    max_length = max(len(original_clean), len(spoken_clean))
    if max_length == 0:
        return 0.0, False, {"error": "Empty text"}
    similarity_score = 1 - (distance / max_length)
    passed = similarity_score >= confidence_threshold
    details = {
        "original_phrase": original_phrase,
        "spoken_text": spoken_text,
        "levenshtein_distance": distance,
        "max_length": max_length,
        "similarity_score": round(similarity_score, 4),
        "confidence_threshold": confidence_threshold,
        "passed": passed
    }
    return similarity_score, passed, details

async def transcribe_audio_with_whisper(audio_file_path: str) -> str:
    temp_converted_path = None
    try:
        print(f"🎤 Transcribing audio with Whisper: {audio_file_path}")
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
        file_size = os.path.getsize(audio_file_path)
        if file_size == 0:
            print("⚠️ Audio file is empty")
            return ""

        audio_file_path = os.path.abspath(audio_file_path)
        if not is_audio_file_readable(audio_file_path):
            print("🔄 Audio file not readable, attempting conversion...")
            temp_converted_path = audio_file_path + "_converted.wav"
            converted_path = convert_audio_to_wav(audio_file_path, temp_converted_path)
            if converted_path != audio_file_path and os.path.exists(converted_path):
                print(f"🔄 Using converted audio file: {converted_path}")
                audio_file_path = converted_path
            else:
                print("⚠️ Audio conversion failed, trying original file")

        # Preprocess audio (trim silence, normalize, truncate)
        audio_array = preprocess_audio(audio_file_path)

        print("🔊 Transcribing preprocessed audio with Whisper...")
        result = whisper_model.transcribe(
            audio_array,
            temperature=0.0,      # deterministic output
            beam_size=5,
            best_of=5,
            language="en",
            task="transcribe"
        )
        transcribed_text = result["text"].strip()
        print(f"✅ Whisper transcription: '{transcribed_text}'")
        return transcribed_text
    except Exception as e:
        print(f"❌ Whisper transcription failed: {str(e)}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        return ""
    finally:
        if temp_converted_path and os.path.exists(temp_converted_path):
            try:
                os.remove(temp_converted_path)
            except Exception:
                pass

# ==========================
# AUDIO FILE HANDLING UTILITIES
# ==========================
def ensure_audio_directory():
    os.makedirs(AUDIO_UPLOAD_DIR, exist_ok=True)
    return AUDIO_UPLOAD_DIR

def save_uploaded_file(upload_file: UploadFile, filename: str) -> str:
    upload_dir = ensure_audio_directory()
    file_path = os.path.join(upload_dir, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        print(f"✅ File saved successfully: {file_path}")
        return file_path
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        raise e

def cleanup_file(file_path: str):
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"🧹 Cleaned up file: {file_path}")
    except Exception as e:
        print(f"⚠️ Could not clean up file {file_path}: {e}")

# ==========================
# PHRASE MANAGEMENT
# ==========================
active_challenges = {}

class ChallengeRequest(BaseModel):
    user_id: int

class ChallengeResponse(BaseModel):
    challenge_id: str
    phrase: str
    expires_at: str

class VerificationRequest(BaseModel):
    user_id: int
    challenge_id: str
    audio_file: str

# ==========================
# ROOT ENDPOINT
# ==========================
@app.get("/")
def read_root():
    return {"message": "VocalID API Running"}

# ==========================
# MANAGER LOGIN
# ==========================
@app.post("/manager/login", response_model=ManagerResponse)
def manager_login(login: ManagerLogin):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT manager_id, username, password, full_name FROM managers WHERE username = %s",
            (login.username,)
        )
        manager = cursor.fetchone()
        if not manager:
            raise HTTPException(status_code=401, detail="Manager not found")
        if not verify_password(login.password, manager['password']):
            raise HTTPException(status_code=401, detail="Invalid password")
        return {
            "manager_id": manager['manager_id'],
            "full_name": manager['full_name'],
            "message": "Login successful"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# REGISTER USER
# ==========================
@app.post("/manager/register-user", response_model=UserResponse)
def register_user(user: UserRegistration):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE email = %s", (user.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already exists")
        cursor.execute("SELECT user_id FROM deleted_user_ids ORDER BY user_id ASC LIMIT 1")
        deleted_user = cursor.fetchone()
        if deleted_user:
            user_id = deleted_user['user_id']
            cursor.execute("DELETE FROM deleted_user_ids WHERE user_id = %s", (user_id,))
            cursor.execute(
                "INSERT INTO users (user_id, full_name, email, created_by) VALUES (%s, %s, %s, %s)",
                (user_id, user.full_name, user.email, user.created_by)
            )
        else:
            cursor.execute(
                "INSERT INTO users (full_name, email, created_by) VALUES (%s, %s, %s)",
                (user.full_name, user.email, user.created_by)
            )
            user_id = cursor.lastrowid
        db.commit()
        try:
            email_result = send_welcome_email(user_id, user.full_name, user.email)
        except Exception as email_error:
            print(f"⚠️ Real email failed, using simulation: {email_error}")
            email_result = simulate_email_sending(user_id, user.full_name, user.email)
        return {
            "user_id": user_id,
            "full_name": user.full_name,
            "email": user.email,
            "message": "User registered successfully",
            "email_sent": email_result
        }
    except mysql.connector.IntegrityError as e:
        db.rollback()
        if "email" in str(e).lower():
            raise HTTPException(status_code=400, detail="Email already exists")
        raise HTTPException(status_code=400, detail="User ID already exists")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# COMPLETE USER CREATION WITH VOICE
# ==========================
@app.post("/manager/create-user-with-voice")
async def create_user_with_voice(
    full_name: str = Form(...),
    email: str = Form(...),
    created_by: int = Form(...),
    audio_files: List[UploadFile] = File(...)
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        # Check if email already exists
        cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already exists")

        # Reuse deleted user IDs first
        cursor.execute("SELECT user_id FROM deleted_user_ids ORDER BY user_id ASC LIMIT 1")
        deleted_user = cursor.fetchone()
        if deleted_user:
            user_id = deleted_user['user_id']
            cursor.execute("DELETE FROM deleted_user_ids WHERE user_id = %s", (user_id,))
            cursor.execute(
                "INSERT INTO users (user_id, full_name, email, created_by) VALUES (%s, %s, %s, %s)",
                (user_id, full_name, email, created_by)
            )
        else:
            cursor.execute(
                "INSERT INTO users (full_name, email, created_by) VALUES (%s, %s, %s)",
                (full_name, email, created_by)
            )
            user_id = cursor.lastrowid

        print(f"👤 User created: {full_name} (ID: {user_id})")

        enrollment_results = []
        successful_enrollments = 0
        for i, audio_file in enumerate(audio_files[:5]):
            try:
                print(f"🎵 Processing voice sample {i+1}...")
                result = await process_single_enrollment_embedding(user_id, audio_file, i+1, db)
                enrollment_results.append(result)
                successful_enrollments += 1
                print(f"✅ Successfully processed sample {i+1}")
            except Exception as e:
                print(f"❌ Failed to process enrollment {i+1}: {str(e)}")
                enrollment_results.append({"success": False, "error": str(e), "sample": i+1})

        db.commit()
        print(f"💾 Database changes committed successfully")

        try:
            email_result = send_welcome_email(user_id, full_name, email)
            email_status = "Real email sent successfully"
        except Exception as email_error:
            print(f"⚠️ Real email failed, using simulation: {email_error}")
            email_result = simulate_email_sending(user_id, full_name, email)
            email_status = "Simulated email sent (real email failed)"

        return {
            "success": True,
            "user_id": user_id,
            "full_name": full_name,
            "email": email,
            "enrollments_processed": successful_enrollments,
            "total_enrollments": len(audio_files[:5]),
            "email_sent": email_result,
            "email_status": email_status,
            "enrollment_details": enrollment_results,
            "message": f"User created successfully with ID: {user_id}. {successful_enrollments} voice samples enrolled. {email_status}."
        }
    except mysql.connector.IntegrityError as e:
        db.rollback()
        if "email" in str(e).lower():
            raise HTTPException(status_code=400, detail="Email already exists")
        raise HTTPException(status_code=400, detail="Registration failed")
    except Exception as e:
        db.rollback()
        print(f"❌ User creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# Process single enrollment with embedding storage (using preprocessed audio)
async def process_single_enrollment_embedding(user_id: int, audio_file: UploadFile, sample_number: int, db_connection=None):
    audio_id = str(uuid.uuid4())
    filename = f"enrollment_{user_id}_{audio_id}.wav"
    file_path = save_uploaded_file(audio_file, filename)
    
    try:
        # Extract embedding using the preprocessed audio
        embedding = extract_embedding_from_preprocessed_file(file_path)
        embedding_list = embedding.tolist()
        
        if db_connection is None:
            db = get_db_connection()
            should_close = True
        else:
            db = db_connection
            should_close = False
        
        cursor = db.cursor()
        try:
            cursor.execute("""
                INSERT INTO voice_enrollments (user_id, audio_id, file_path, created_at)
                VALUES (%s, %s, %s, %s)
            """, (user_id, audio_id, file_path, datetime.now()))
            enrollment_id = cursor.lastrowid
            
            cursor.execute("""
                INSERT INTO speaker_embeddings (enrollment_id, embedding, model_name)
                VALUES (%s, %s, %s)
            """, (enrollment_id, json.dumps(embedding_list), 'ecapa-tdnn'))
            
            if should_close:
                db.commit()
            
            print(f"🎯 SUCCESS: Stored embedding #{sample_number} for user {user_id}")
            return {
                "success": True,
                "sample": sample_number,
                "audio_id": audio_id,
                "embedding_shape": embedding.shape
            }
        except Exception as db_error:
            if should_close:
                db.rollback()
            raise db_error
        finally:
            cursor.close()
            if should_close:
                db.close()
    except Exception as e:
        cleanup_file(file_path)
        print(f"❌ Enrollment processing failed: {str(e)}")
        raise e

# ==========================
# USER MANAGEMENT
# ==========================
@app.get("/manager/users")
def get_all_users():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT user_id, full_name, email, created_at 
            FROM users 
            ORDER BY user_id ASC
        """)
        return {"users": cursor.fetchall()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

@app.put("/manager/users/{user_id}")
def update_user(user_id: int, user_update: UserUpdate):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        cursor.execute("UPDATE users SET full_name = %s WHERE user_id = %s",
                       (user_update.full_name, user_id))
        db.commit()
        return {
            "user_id": user_id,
            "full_name": user_update.full_name,
            "message": "User updated successfully"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

@app.delete("/manager/users/{user_id}")
def delete_user(user_id: int):
    db = get_db_connection()
    cursor = db.cursor()
    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        cursor.execute("INSERT INTO deleted_user_ids (user_id) VALUES (%s)", (user_id,))
        cursor.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        db.commit()
        return {"message": "User deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# AUDIO UPLOAD ENDPOINT (deprecated but kept for compatibility)
# ==========================
class AudioResponse(BaseModel):
    message: str
    audio_id: str
    file_path: str

@app.post("/audio/upload-enrollment")
async def upload_enrollment_audio(
    user_id: int = Form(...),
    audio_file: UploadFile = File(...)
):
    ensure_audio_directory()
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        cursor.execute("SELECT COUNT(*) as count FROM voice_enrollments WHERE user_id = %s", (user_id,))
        enrollment_count = cursor.fetchone()['count']
        if enrollment_count >= 5:
            raise HTTPException(status_code=400, detail="Maximum 5 voice enrollments allowed per user")
    finally:
        cursor.close()
        db.close()
    
    audio_id = str(uuid.uuid4())
    filename = f"enrollment_{user_id}_{audio_id}.wav"
    try:
        file_path = save_uploaded_file(audio_file, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving audio file: {str(e)}")
    
    # Extract and store embedding (using preprocessed audio)
    try:
        embedding = extract_embedding_from_preprocessed_file(file_path)
        embedding_list = embedding.tolist()
    except Exception as e:
        cleanup_file(file_path)
        raise HTTPException(status_code=500, detail=f"Error extracting embedding: {str(e)}")
    
    db = get_db_connection()
    cursor = db.cursor()
    try:
        cursor.execute("""
            INSERT INTO voice_enrollments (user_id, audio_id, file_path, created_at)
            VALUES (%s, %s, %s, %s)
        """, (user_id, audio_id, file_path, datetime.now()))
        enrollment_id = cursor.lastrowid
        
        cursor.execute("""
            INSERT INTO speaker_embeddings (enrollment_id, embedding, model_name)
            VALUES (%s, %s, %s)
        """, (enrollment_id, json.dumps(embedding_list), 'ecapa-tdnn'))
        
        db.commit()
        print(f"🎯 SUCCESS: Stored enrollment #{enrollment_count + 1} for user {user_id}")
        return {
            "message": "Enrollment audio uploaded successfully",
            "audio_id": audio_id,
            "file_path": file_path,
            "enrollment_count": enrollment_count + 1,
            "embedding_extracted": True,
            "embedding_shape": embedding.shape
        }
    except Exception as e:
        db.rollback()
        cleanup_file(file_path)
        raise HTTPException(status_code=500, detail=f"Error storing enrollment: {str(e)}")
    finally:
        cursor.close()
        db.close()

# ==========================
# EMBEDDING-BASED BIOMETRIC FUNCTIONS
# ==========================
def get_user_embeddings(user_id: int) -> List[np.ndarray]:
    """Fetch all speaker embeddings for a user."""
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT se.embedding
            FROM speaker_embeddings se
            JOIN voice_enrollments ve ON se.enrollment_id = ve.id
            WHERE ve.user_id = %s
        """, (user_id,))
        rows = cursor.fetchall()
        embeddings = [np.array(json.loads(row['embedding'])) for row in rows]
        print(f"🔍 Retrieved {len(embeddings)} embeddings for user {user_id}")
        return embeddings
    except Exception as e:
        print(f"❌ Error fetching embeddings for user {user_id}: {e}")
        return []
    finally:
        cursor.close()
        db.close()

def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Cosine similarity between two vectors."""
    dot = np.dot(vec1, vec2)
    norm = np.linalg.norm(vec1) * np.linalg.norm(vec2) + 1e-8
    return float(dot / norm)

def biometric_verification_embedding(user_id: int, verification_embedding: np.ndarray) -> Optional[float]:
    """
    Compare verification embedding with stored embeddings.
    Returns mean of top 3 cosine similarities.
    """
    stored_embeddings = get_user_embeddings(user_id)
    if not stored_embeddings:
        print(f"⚠️ No embeddings found for user {user_id}")
        return None

    scores = [cosine_similarity(verification_embedding, emb) for emb in stored_embeddings]
    scores.sort(reverse=True)
    top_k = min(3, len(scores))
    mean_score = sum(scores[:top_k]) / top_k
    print(f"🎯 Embedding scores (top {top_k}): {[round(s,4) for s in scores[:top_k]]}, mean: {mean_score:.4f}")
    return mean_score

# ==========================
# USER INFO ENDPOINTS
# ==========================
@app.get("/user/{user_id}/enrollment-info")
def get_user_enrollment_info(user_id: int):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT COUNT(*) as enrollment_count FROM voice_enrollments WHERE user_id = %s", (user_id,))
        count_result = cursor.fetchone()
        cursor.execute("""
            SELECT 
                ve.audio_id,
                ve.created_at
            FROM voice_enrollments ve
            WHERE ve.user_id = %s
            ORDER BY ve.created_at DESC
        """, (user_id,))
        enrollments = cursor.fetchall()
        return {
            "user_id": user_id,
            "enrollment_count": count_result['enrollment_count'],
            "max_enrollments": 5,
            "can_record_more": count_result['enrollment_count'] < 5,
            "enrollments": enrollments
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cursor.close()
        db.close()

@app.get("/user/{user_id}/enrollments")
def get_user_enrollments(user_id: int):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        print(f"🔍 Fetching enrollments for user_id: {user_id}")
        cursor.execute("""
            SELECT audio_id, file_path, created_at 
            FROM voice_enrollments 
            WHERE user_id = %s 
            ORDER BY created_at DESC
        """, (user_id,))
        enrollments = cursor.fetchall()
        print(f"✅ Found {len(enrollments)} enrollments for user {user_id}")
        return {"success": True, "enrollments": enrollments, "count": len(enrollments)}
    except Exception as e:
        print(f"❌ Error fetching enrollments: {str(e)}")
        return {"success": False, "error": str(e), "enrollments": []}
    finally:
        cursor.close()
        db.close()

@app.get("/user/{user_id}/info")
def get_user_info(user_id: int):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT user_id, full_name, email, created_at 
            FROM users 
            WHERE user_id = %s
        """, (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# PHRASE GENERATION
# ==========================
@app.post("/auth/generate-challenge", response_model=ChallengeResponse)
def generate_challenge(request: ChallengeRequest):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (request.user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    finally:
        cursor.close()
        db.close()
    challenge_id = str(uuid.uuid4())
    phrase = generate_random_phrase()
    expires_at = datetime.now().timestamp() + 300
    active_challenges[challenge_id] = {
        'user_id': request.user_id,
        'phrase': phrase,
        'expires_at': expires_at,
        'used': False
    }
    print(f"🎯 Generated challenge: {phrase} for user {request.user_id}")
    return ChallengeResponse(
        challenge_id=challenge_id,
        phrase=phrase,
        expires_at=str(expires_at)
    )

@app.get("/auth/random-phrase")
def random_phrase():
    phrase = generate_random_phrase()
    print(f"🎯 Generated random phrase for enrollment: {phrase}")
    return {"phrase": phrase}

# ==========================
# VERIFY PHRASE (with spoof detection)
# ==========================
@app.post("/auth/verify-phrase")
async def verify_phrase(
    audio_file: UploadFile = File(...),
    phrase: str = Form(...)
):
    temp_filepath = None
    cleaned_path = None
    try:
        temp_audio_id = str(uuid.uuid4())
        temp_filename = f"verify_{temp_audio_id}.wav"
        temp_filepath = save_uploaded_file(audio_file, temp_filename)

        file_size = os.path.getsize(temp_filepath)
        print(f"📁 Enrollment audio file size: {file_size} bytes")

        cleaned_path = preprocess_and_save_temp(temp_filepath)

        # ✅ Pass phase — threshold is 0.92 for registration
        is_spoof, spoof_score = detect_spoof(cleaned_path, phase="registration")
        print(f"🔍 Enrollment spoof detection: is_spoof={is_spoof}, score={spoof_score:.4f}")

        # ✅ Single clean check — no dual threshold, no warning-but-bypass
        if is_spoof:
            return {
                "success": False,
                "spoof_detected": True,
                "spoof_score": spoof_score,
                "message": "Synthetic or replayed voice detected. Please speak naturally and try again."
            }

        # If we reach here, is_spoof=False guaranteed — clean audio
        spoken_text = await transcribe_audio_with_whisper(temp_filepath)
        match_score, passed, details = verify_text_match(
            phrase, spoken_text, confidence_threshold=0.40
        )

        return {
            "success": passed,
            "score": match_score,
            "spoken_text": spoken_text,
            "details": details,
            "spoof_detected": False,   # always False here — we returned early above if True
            "spoof_score": spoof_score
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_file(temp_filepath)
        if cleaned_path and os.path.exists(cleaned_path):
            os.remove(cleaned_path)

# ==========================
# MANAGER VERIFICATION ATTEMPTS
# ==========================
@app.get("/manager/verification-attempts")
def get_all_verification_attempts(
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[int] = None,
    decision: Optional[str] = None
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        base_query = """
            SELECT 
                va.attempt_id,
                va.user_id,
                u.full_name,
                va.challenge_id,
                va.phrase_used,
                va.spoken_text,
                va.text_match_score,
                va.text_verification_passed,
                va.biometric_score,
                va.spoof_score,
                va.spoof_detected,
                va.final_decision,
                va.attempt_timestamp
            FROM verification_attempts va
            LEFT JOIN users u ON va.user_id = u.user_id
            WHERE 1=1
        """
        params = []
        if user_id is not None:
            base_query += " AND va.user_id = %s"
            params.append(user_id)
        if decision and decision in ['accepted', 'rejected']:
            base_query += " AND va.final_decision = %s"
            params.append(decision)
        base_query += " ORDER BY va.attempt_timestamp DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        cursor.execute(base_query, params)
        attempts = cursor.fetchall()

        count_query = "SELECT COUNT(*) as total FROM verification_attempts va WHERE 1=1"
        count_params = []
        if user_id is not None:
            count_query += " AND va.user_id = %s"
            count_params.append(user_id)
        if decision and decision in ['accepted', 'rejected']:
            count_query += " AND va.final_decision = %s"
            count_params.append(decision)
        cursor.execute(count_query, count_params)
        total_count = cursor.fetchone()['total']

        return {
            "success": True,
            "attempts": attempts,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "returned": len(attempts)
            }
        }
    except Exception as e:
        print(f"❌ Error fetching verification attempts: {str(e)}")
        return {"success": False, "error": str(e), "attempts": []}
    finally:
        cursor.close()
        db.close()

# ==========================
# ATTENDANCE STATUS
# ==========================
@app.get("/attendance/status")
def get_attendance_status(user_id: int):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT last_attendance_verification, consecutive_misses
            FROM users
            WHERE user_id = %s
            """,
            (user_id,)
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        last_verification = user.get("last_attendance_verification")
        next_prompt_seconds = 0
        if last_verification is not None:
            elapsed = (datetime.now() - last_verification).total_seconds()
            random_interval = generate_attendance_interval_seconds()
            if elapsed < random_interval:
                next_prompt_seconds = int(random_interval - elapsed)
        return {
            "last_verification_time": last_verification.isoformat() if last_verification else None,
            "next_prompt_seconds": next_prompt_seconds,
            "consecutive_misses": int(user.get("consecutive_misses") or 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# ATTENDANCE VERIFICATION
# ==========================
@app.post("/attendance/verify")
async def verify_attendance(
    challenge_id: str = Form(...),
    audio_file: UploadFile = File(...),
    user_id: int = Form(...),
    scheduled_time: str = Form(...)
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    temp_filepath = None
    cleaned_path = None
    next_interval_seconds = generate_attendance_interval_seconds()
    original_phrase = None
    scheduled_dt = parse_iso_datetime(scheduled_time) or datetime.now()

    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        challenge = active_challenges.get(challenge_id)
        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")
        if challenge['used']:
            raise HTTPException(status_code=400, detail="Challenge already used")
        if datetime.now().timestamp() > challenge['expires_at']:
            del active_challenges[challenge_id]
            raise HTTPException(status_code=400, detail="Challenge expired")
        if challenge['user_id'] != user_id:
            raise HTTPException(status_code=400, detail="User ID mismatch")

        verification_ts = datetime.now()
        response_delay_seconds = max(0.0, (verification_ts - scheduled_dt).total_seconds())

        temp_audio_id = str(uuid.uuid4())
        temp_filename = f"attendance_{user_id}_{temp_audio_id}.wav"
        temp_filepath = save_uploaded_file(audio_file, temp_filename)

        original_phrase = challenge['phrase']
        spoken_text = None
        text_score = 0.0
        text_passed = False
        biometric_score = None
        text_details = {
            "original_phrase": original_phrase,
            "spoken_text": None,
            "levenshtein_distance": None,
            "max_length": None,
            "similarity_score": 0.0,
            "confidence_threshold": 0.40,
            "passed": False
        }

        cleaned_path = preprocess_and_save_temp(temp_filepath)

        # ✅ Pass phase — threshold is 0.90 for attendance
        is_spoof, spoof_score = detect_spoof(cleaned_path, phase="attendance")
        print(f"🔍 Attendance spoof detection: is_spoof={is_spoof}, score={spoof_score:.4f}")

        # ✅ Single clean check — is_spoof=True only at ≥0.90, no warning-bypass gap
        if is_spoof:
            final_decision = "rejected"
            message = "Spoofing detected. Please speak naturally and try again."
        else:
            # is_spoof=False guaranteed here — proceed with full verification
            spoken_text = await transcribe_audio_with_whisper(temp_filepath)
            verification_result = verify_text_match(
                original_phrase, spoken_text, confidence_threshold=0.40
            )
            if verification_result:
                text_score, text_passed, text_details = verification_result
                text_score = float(text_score)
                text_passed = bool(text_passed)
            else:
                text_details = {
                    "original_phrase": original_phrase,
                    "spoken_text": spoken_text,
                    "levenshtein_distance": None,
                    "max_length": None,
                    "similarity_score": 0.0,
                    "confidence_threshold": 0.40,
                    "passed": False
                }

            try:
                verification_embedding = extract_embedding_from_preprocessed_file(temp_filepath)
                biometric_score = biometric_verification_embedding(user_id, verification_embedding)
                if biometric_score is not None:
                    biometric_score = float(biometric_score)
            except Exception as embedding_error:
                print(f"⚠️ Attendance biometric verification failed: {embedding_error}")
                biometric_score = None

            biometric_passed = biometric_score is not None and biometric_score >= 0.40

            if text_passed and biometric_passed:
                final_decision = "accepted"
                message = "Attendance verification successful"
            elif not text_passed:
                final_decision = "rejected"
                message = "Text verification failed"
            elif biometric_score is None:
                final_decision = "rejected"
                message = "Voice enrollment not found. Please enroll your voice first."
            else:
                final_decision = "rejected"
                message = f"Voice biometric failed (score: {biometric_score:.2f})"

        # Update user record
        if final_decision == "accepted":
            challenge['used'] = True
            cursor.execute(
                """
                UPDATE users
                SET consecutive_misses = 0,
                    last_attendance_verification = NOW()
                WHERE user_id = %s
                """,
                (user_id,)
            )
        else:
            cursor.execute(
                """
                UPDATE users
                SET consecutive_misses = COALESCE(consecutive_misses, 0) + 1
                WHERE user_id = %s
                """,
                (user_id,)
            )

        cursor.execute("SELECT consecutive_misses FROM users WHERE user_id = %s", (user_id,))
        updated_user = cursor.fetchone() or {}
        consecutive_misses = int(updated_user.get("consecutive_misses") or 0)

        cursor.execute(
            """
            INSERT INTO attendance_logs
            (user_id, challenge_id, phrase_used, spoken_text, text_match_score,
             text_verification_passed, biometric_score, spoof_score, spoof_detected,
             final_decision, verification_timestamp, scheduled_time, response_delay_seconds)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id, challenge_id, original_phrase, spoken_text,
                text_score, text_passed, biometric_score,
                spoof_score, is_spoof, final_decision,
                verification_ts, scheduled_dt, response_delay_seconds
            )
        )
        attendance_log_id = cursor.lastrowid
        db.commit()

        if final_decision != "accepted" and consecutive_misses >= 2:
            cursor.execute(
                """
                SELECT verification_timestamp FROM attendance_logs
                WHERE user_id = %s AND final_decision IN ('rejected', 'missed')
                ORDER BY verification_timestamp DESC LIMIT 2
                """,
                (user_id,)
            )
            missed_rows = cursor.fetchall()
            missed_timestamps = [
                row.get("verification_timestamp").isoformat() for row in missed_rows
            ]
            if len(missed_timestamps) >= 2:
                send_attendance_alert(user_id, missed_timestamps)

        return {
            "success": final_decision == "accepted",
            "final_decision": final_decision,
            "message": message,
            "text_verification": text_details,
            "biometric_score": biometric_score,
            "spoof_detected": is_spoof,
            "spoof_score": spoof_score,
            "user_id": user_id,
            "challenge_id": challenge_id,
            "attendance_log_id": attendance_log_id,
            "consecutive_misses": consecutive_misses,
            "next_interval_seconds": next_interval_seconds
        }

    except HTTPException as e:
        db.rollback()
        raise e
    except Exception as e:
        db.rollback()
        print(f"❌ Attendance verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup_file(temp_filepath)
        if cleaned_path and os.path.exists(cleaned_path):
            os.remove(cleaned_path)
        cursor.close()
        db.close()

# ==========================
# MANAGER ATTENDANCE LOGS
# ==========================
@app.get("/manager/attendance-logs")
def get_manager_attendance_logs(
    user_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    decision: Optional[str] = None
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        query = """
            SELECT
                al.log_id,
                al.user_id,
                u.full_name,
                al.challenge_id,
                al.phrase_used,
                al.spoken_text,
                al.text_match_score,
                al.text_verification_passed,
                al.spoof_score,
                al.spoof_detected,
                al.final_decision,
                al.verification_timestamp,
                al.scheduled_time,
                al.response_delay_seconds
            FROM attendance_logs al
            LEFT JOIN users u ON al.user_id = u.user_id
            WHERE 1 = 1
        """
        params = []
        if user_id is not None:
            query += " AND al.user_id = %s"
            params.append(user_id)
        if decision and decision in ["accepted", "rejected", "missed"]:
            query += " AND al.final_decision = %s"
            params.append(decision)
        if start_date:
            query += " AND DATE(al.verification_timestamp) >= %s"
            params.append(start_date)
        if end_date:
            query += " AND DATE(al.verification_timestamp) <= %s"
            params.append(end_date)
        query += " ORDER BY al.verification_timestamp DESC"
        cursor.execute(query, params)
        logs = cursor.fetchall()
        return {"success": True, "logs": logs, "count": len(logs)}
    except Exception as e:
        return {"success": False, "error": str(e), "logs": []}
    finally:
        cursor.close()
        db.close()

# ==========================
# ENHANCED VERIFICATION (Login)
# ==========================
@app.post("/auth/verify-challenge-enhanced")
async def verify_challenge_enhanced(
    challenge_id: str = Form(...),
    audio_file: UploadFile = File(...),
    user_id: int = Form(...)
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    temp_filepath = None
    cleaned_path = None

    try:
        challenge = active_challenges.get(challenge_id)
        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")
        if challenge['used']:
            raise HTTPException(status_code=400, detail="Challenge already used")
        if datetime.now().timestamp() > challenge['expires_at']:
            del active_challenges[challenge_id]
            raise HTTPException(status_code=400, detail="Challenge expired")
        if challenge['user_id'] != user_id:
            raise HTTPException(status_code=400, detail="User ID mismatch")

        temp_audio_id = str(uuid.uuid4())
        temp_filename = f"verification_{user_id}_{temp_audio_id}.wav"
        temp_filepath = save_uploaded_file(audio_file, temp_filename)

        # Preprocess audio for spoof detection
        cleaned_path = preprocess_and_save_temp(temp_filepath)
        is_spoof, spoof_score = detect_spoof(cleaned_path)
        print(f"🔍 Spoof detection: is_spoof={is_spoof}, score={spoof_score:.4f}")

        # Lenient spoof policy for login
        HARD_SPOOF_REJECT_THRESHOLD = 0.90
        if is_spoof and spoof_score >= HARD_SPOOF_REJECT_THRESHOLD:
            original_phrase = challenge['phrase']
            cursor.execute("""
                INSERT INTO verification_attempts 
                (user_id, challenge_id, phrase_used, spoken_text, text_match_score, 
                 text_verification_passed, biometric_score, spoof_score, spoof_detected)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id, challenge_id, original_phrase, None, 0.0, False, None, spoof_score, True
            ))
            attempt_id = cursor.lastrowid
            db.commit()
            cleanup_file(temp_filepath)
            if cleaned_path and os.path.exists(cleaned_path):
                os.remove(cleaned_path)
            cursor.close()
            db.close()
            return {
                "success": False,
                "final_decision": "rejected",
                "message": "Spoofing detected (synthetic voice).",
                "spoof_detected": True,
                "spoof_score": spoof_score,
                "attempt_id": attempt_id,
                "user_id": user_id
            }
        # If spoof score is below threshold, proceed normally (even if is_spoof=True)
        if is_spoof:
            print(f"⚠️ Login spoof warning: score {spoof_score:.2f} accepted")

        # Text verification
        spoken_text = await transcribe_audio_with_whisper(temp_filepath)
        original_phrase = challenge['phrase']
        match_score, text_passed, text_details = verify_text_match(
            original_phrase, spoken_text, confidence_threshold=0.40
        )

        # Biometric verification (using preprocessed audio)
        biometric_score = None
        try:
            verification_embedding = extract_embedding_from_preprocessed_file(temp_filepath)
            biometric_score = biometric_verification_embedding(user_id, verification_embedding)
            if biometric_score is not None:
                biometric_score = float(biometric_score)
        except Exception as e:
            print(f"⚠️ Biometric verification failed: {e}")

        # Log attempt
        cursor.execute("""
            INSERT INTO verification_attempts 
            (user_id, challenge_id, phrase_used, spoken_text, text_match_score, 
             text_verification_passed, biometric_score, spoof_score, spoof_detected)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user_id, challenge_id, original_phrase, spoken_text, match_score,
            text_passed, biometric_score, spoof_score, is_spoof
        ))
        attempt_id = cursor.lastrowid

        BIOMETRIC_THRESHOLD = 0.40
        if text_passed and biometric_score is not None and biometric_score >= BIOMETRIC_THRESHOLD:
            challenge['used'] = True
            final_decision = "accepted"
            message = "Text and voice verification successful"
            cursor.execute("UPDATE verification_attempts SET final_decision = 'accepted' WHERE attempt_id = %s", (attempt_id,))
        elif text_passed:
            final_decision = "rejected"
            if biometric_score is None:
                message = "Voice biometric not available (no enrollments)"
            else:
                message = f"Voice biometric failed (score {biometric_score:.4f} < threshold {BIOMETRIC_THRESHOLD})"
            cursor.execute("UPDATE verification_attempts SET final_decision = 'rejected' WHERE attempt_id = %s", (attempt_id,))
        else:
            final_decision = "rejected"
            message = "Text verification failed - spoken phrase does not match"
            cursor.execute("UPDATE verification_attempts SET final_decision = 'rejected' WHERE attempt_id = %s", (attempt_id,))

        db.commit()

        response = {
            "success": (final_decision == "accepted"),
            "final_decision": final_decision,
            "message": message,
            "text_verification": text_details,
            "attempt_id": attempt_id,
            "user_id": user_id,
            "spoof_detected": is_spoof,
            "spoof_score": spoof_score
        }
        if biometric_score is not None:
            response["voice_biometric"] = {
                "biometric_score": round(biometric_score, 4),
                "similarity": round(biometric_score, 4)
            }
        else:
            response["voice_biometric"] = None

        return response

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Verification error: {str(e)}")
    finally:
        cleanup_file(temp_filepath)
        if cleaned_path and os.path.exists(cleaned_path):
            os.remove(cleaned_path)
        cursor.close()
        db.close()

# ==========================
# VERIFICATION ATTEMPTS
# ==========================
@app.get("/auth/verification-attempts/{user_id}")
def get_verification_attempts(user_id: int, limit: int = 10):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT 
                attempt_id, challenge_id, phrase_used, spoken_text, text_match_score,
                text_verification_passed, biometric_score, spoof_score, spoof_detected,
                final_decision, attempt_timestamp
            FROM verification_attempts 
            WHERE user_id = %s 
            ORDER BY attempt_timestamp DESC 
            LIMIT %s
        """, (user_id, limit))
        attempts = cursor.fetchall()
        return {"user_id": user_id, "attempts": attempts, "total": len(attempts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# Legacy endpoint
@app.post("/auth/verify-challenge")
def verify_challenge(challenge_id: str, spoken_phrase: str = Form(...)):
    challenge = active_challenges.get(challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if challenge['used']:
        raise HTTPException(status_code=400, detail="Challenge already used")
    if datetime.now().timestamp() > challenge['expires_at']:
        del active_challenges[challenge_id]
        raise HTTPException(status_code=400, detail="Challenge expired")
    is_correct = spoken_phrase.strip().lower() == challenge['phrase'].lower()
    if is_correct:
        challenge['used'] = True
        return {"success": True, "message": "Phrase verification successful", "user_id": challenge['user_id']}
    else:
        return {"success": False, "message": "Spoken phrase does not match challenge"}

@app.get("/user/{user_id}/attendance-logs")
def get_user_attendance_logs(
    user_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        cursor.execute("SELECT COUNT(*) AS total FROM attendance_logs WHERE user_id = %s", (user_id,))
        total = int((cursor.fetchone() or {}).get("total") or 0)
        cursor.execute(
            """
            SELECT
                log_id, user_id, challenge_id, phrase_used, spoken_text, text_match_score,
                text_verification_passed, biometric_score, spoof_score, spoof_detected,
                final_decision, verification_timestamp, scheduled_time, response_delay_seconds
            FROM attendance_logs
            WHERE user_id = %s
            ORDER BY verification_timestamp DESC
            LIMIT %s OFFSET %s
            """,
            (user_id, limit, offset)
        )
        logs = cursor.fetchall() or []
        return {"logs": logs, "total": total, "limit": limit, "offset": offset}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

@app.get("/user/{user_id}")
def get_user(user_id: int):
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT user_id, full_name, email FROM users WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()

# ==========================
# RUN SERVER
# ==========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)