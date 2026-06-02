FROM python:3.10-slim

# Install system deps (ffmpeg & audio libs)
RUN apt-get update -o Acquire::ForceIPv4=true && \
    apt-get install -y ffmpeg libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install a setuptools version that still includes pkg_resources
RUN pip install --upgrade pip setuptools==69.5.1 wheel

# Install CPU-only PyTorch and TorchAudio (to avoid GPU/CUDA issues)
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir --no-build-isolation -r requirements.txt

# Pre‑download the two main models we actually use (Whisper and ECAPA‑TDNN)
RUN python -c "from speechbrain.pretrained import EncoderClassifier; EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb')" && \
    python -c "import whisper; whisper.load_model('base')"


# Copy the whole backend folder (including fine‑tuned model)
COPY . .

# Ensure uploads directory exists
RUN mkdir -p uploads/audio

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]