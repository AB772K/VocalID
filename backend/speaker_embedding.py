# speaker_embedding.py
import warnings
warnings.filterwarnings("ignore", message=".*symlink.*", category=UserWarning)
warnings.filterwarnings("ignore", message=".*Pretrainer collection.*", category=UserWarning)

import torch
import librosa
import os
import shutil
from pathlib import Path
import speechbrain as sb
from speechbrain.inference.speaker import EncoderClassifier
import numpy as np

# Monkey-patch link_with_strategy to always COPY (avoids symlink privilege errors on Windows)
_original_link_with_strategy = sb.utils.fetching.link_with_strategy

def _copy_link_with_strategy(source, dest, *args, **kwargs):
    source, dest = Path(source), Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() or dest.is_symlink():
        dest.unlink()
    shutil.copy2(str(source), str(dest))
    return dest

sb.utils.fetching.link_with_strategy = _copy_link_with_strategy

# Also patch os.symlink globally as a safety net for Pretrainer path
_original_symlink = os.symlink

def _safe_symlink(src, dst, target_is_directory=False, **kwargs):
    """Replace symlink with copy to avoid Windows privilege errors"""
    src, dst = Path(src), Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() or dst.is_symlink():
        dst.unlink()
    if src.is_dir():
        shutil.copytree(str(src), str(dst))
    else:
        shutil.copy2(str(src), str(dst))

os.symlink = _safe_symlink

print("🔧 Loading ECAPA-TDNN model...")
# Load pre-trained model
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="pretrained_models/spkrec-ecapa-voxceleb",
)
print("✅ ECAPA-TDNN model loaded successfully!")

# Restore original symlink after model is loaded
os.symlink = _original_symlink

def extract_embedding(audio_path: str) -> np.ndarray:
    """
    Extract 512-dimensional speaker embedding from an audio file.
    Uses librosa to load audio (avoids torchcodec issues on Windows).
    Returns a numpy array of shape (512,).
    """
    audio_path = os.path.abspath(audio_path)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    print(f"🔍 extract_embedding called with audio_path: {audio_path}")

    try:
        # Load audio with librosa (16kHz, mono)
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        # Convert to torch tensor of shape (1, time)
        waveform = torch.from_numpy(y).unsqueeze(0)
        print(f"⏳ Encoding batch...")
        embedding = classifier.encode_batch(waveform)
        embedding = embedding.squeeze().cpu().numpy()
        print(f"✅ Final embedding shape: {embedding.shape}")
        return embedding
    except Exception as e:
        print(f"❌ Error extracting embedding: {e}")
        raise