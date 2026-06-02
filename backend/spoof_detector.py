# spoof_detector.py
import os
import librosa
import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

MODEL_PATH = os.path.join(os.path.dirname(__file__), "replay_finetuned_final")
TARGET_SR = 16000

#Much stricter — only flag when model is extremely confident
SPOOF_THRESHOLDS = {
    "registration": {"min_prob": 0.99, "min_margin": 0.99},
    "login":        {"min_prob": 0.99, "min_margin": 0.99},
    "attendance":   {"min_prob": 0.99, "min_margin": 0.99},
    "default":      {"min_prob": 0.99, "min_margin": 0.99},
}

print("🔄 Loading anti-spoofing model (fine-tuned)...")
try:
    feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_PATH)
    model = AutoModelForAudioClassification.from_pretrained(MODEL_PATH)
    model.eval()
    print(f"✅ Anti-spoofing model loaded.")
    print(f"📋 Labels: {model.config.id2label}")  # always print so you can see label mapping
except Exception as e:
    print(f"❌ Failed to load anti-spoofing model: {e}")
    feature_extractor = None
    model = None


def detect_spoof(audio_path: str, phase: str = "default"):
    """
    Returns (is_spoof: bool, spoof_probability: float)

    is_spoof=True only when BOTH:
      1. spoof_prob >= min_prob  (very high absolute confidence)
      2. margin >= min_margin    (bonafide score must be very low)
    """
    if model is None or feature_extractor is None:
        print("⚠️ Anti-spoofing model not available. Skipping check.")
        return False, 0.0

    try:
        audio_numpy, sr = librosa.load(audio_path, sr=TARGET_SR, mono=True)

        # --- Basic quality checks ---
        if len(audio_numpy) < TARGET_SR * 0.5:
            print("⚠️ Audio too short — skipping spoof check, treating as real.")
            return False, 0.0

        rms = np.sqrt(np.mean(audio_numpy ** 2))
        if rms < 0.001:
            print("⚠️ Audio silent — skipping spoof check, treating as real.")
            return False, 0.0

        # Soft normalization — avoid clipping real voice characteristics
        peak = np.abs(audio_numpy).max()
        if peak > 0:
            audio_numpy = audio_numpy / (peak + 1e-8) * 0.95  # scale to 0.95 not 1.0

        inputs = feature_extractor(
            [audio_numpy],
            sampling_rate=TARGET_SR,
            return_tensors="pt",
            padding=True
        )

        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)

        # Resolve spoof vs bonafide indices from model labels
        spoof_idx    = None
        bonafide_idx = None

        if hasattr(model.config, 'id2label'):
            for idx, label in model.config.id2label.items():
                label_lower = label.lower()
                if any(w in label_lower for w in ['spoof', 'fake', 'deepfake', 'synthetic', 'replay']):
                    spoof_idx = int(idx)
                if any(w in label_lower for w in ['bonafide', 'genuine', 'real', 'human', 'bona']):
                    bonafide_idx = int(idx)

        # Fallback if labels don't match keywords
        if spoof_idx is None and bonafide_idx is not None:
            spoof_idx = 1 - bonafide_idx
        elif spoof_idx is None:
            spoof_idx = 1  # assume index 1 is spoof

        bonafide_idx = 1 - spoof_idx

        spoof_prob    = probs[0, spoof_idx].item()
        bonafide_prob = probs[0, bonafide_idx].item()
        margin        = spoof_prob - bonafide_prob

        thresholds = SPOOF_THRESHOLDS.get(phase, SPOOF_THRESHOLDS["default"])
        min_prob   = thresholds["min_prob"]
        min_margin = thresholds["min_margin"]

        is_spoof = (spoof_prob >= min_prob) and (margin >= min_margin)

        # Detailed log so you can monitor real vs fake scores
        verdict = "🚨 SPOOF" if is_spoof else "✅ REAL"
        print(
            f"{verdict} [{phase}] | "
            f"spoof={spoof_prob:.4f} | bonafide={bonafide_prob:.4f} | "
            f"margin={margin:.4f} | "
            f"need prob>={min_prob} & margin>={min_margin} | "
            f"rms={rms:.4f} | dur={len(audio_numpy)/TARGET_SR:.2f}s"
        )

        return is_spoof, spoof_prob

    except Exception as e:
        print(f"❌ Error during spoof detection: {e}")
        return False, 0.0  # fail safe — don't block real users on error
    

