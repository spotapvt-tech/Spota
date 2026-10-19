import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { checkBadges } from '../lib/badgeEngine';
import { analyzeImageColor } from '../lib/imageUtils';
import { dropGem } from '../lib/gemService';
import { getSuggestedDescription } from '../lib/gemWizardData';
import { getCategoryById } from '../lib/categoryConfig';
import { registerBackInterceptor } from '../lib/hardwareBack';

import GemWizardProgress from '../components/GemWizardProgress';
import GemWizardCTA from '../components/GemWizardCTA';
import StepCapture from './steps/StepCapture';
import StepPin from './steps/StepPin';
import StepName from './steps/StepName';
import StepRate from './steps/StepRate';
import StepVibe from './steps/StepVibe';
import StepReview from './steps/StepReview';
import StepCelebrate from './steps/StepCelebrate';

import './AddGemView.css';

// Validation: what's needed to advance from each step
const TOTAL_STEPS = 6; // 1 Capture · 2 Pin · 3 Name · 4 Rate · 5 Vibe · 6 Review — 7 is the celebration

function stepValid(step, state) {
  const { photoFile, location, gemName, category, description, safetyAck } = state;
  if (step === 1) return !!photoFile;
  if (step === 2) return !!(location?.lat && location?.lng);
  if (step === 3) return !!(gemName?.trim() && category);
  if (step === 4) return true; // vibe ratings always valid
  if (step === 5) return !!(description?.trim());
  if (step === 6) return !!(description?.trim()) && !!safetyAck;
  return true;
}

export default function AddGemView() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Wizard navigation
  const [wizardStep, setWizardStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [droppedGem, setDroppedGem] = useState(null);

  // Step 1 — Capture
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFilter, setPhotoFilter] = useState('none');
  const [cameraBase64, setCameraBase64] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  // GPS extracted from image EXIF before canvas compression strips it
  const [photoGps, setPhotoGps] = useState(null); // {lat, lng} | null

  // Step 2 — Pin
  const [location, setLocation] = useState(null);

  // Step 3 — Name
  const [gemName, setGemName] = useState('');
  const [category, setCategory] = useState('cafe');

  // Step 4 — Rate
  const [vibeRatings, setVibeRatings] = useState({
    cozy: 3, insta_worthy: 3, lively: 3, zen: 3, workspace: 3
  });

  // Step 5 — Vibe
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  // Step 6 — Review
  const [safetyAck, setSafetyAck] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Color profile from photo (used for AI suggestions)
  const [colorProfile, setColorProfile] = useState(null);

  // Analyse image color when photo selected → seeds AI descriptions
  useEffect(() => {
    if (!photoPreview) return; // no photo: colour profile is ignored (see activeColorProfile)
    const t = setTimeout(async () => {
      try {
        const profile = await analyzeImageColor(photoPreview);
        setColorProfile(profile);
        // Pre-seed description if empty
        if (!description) {
          setDescription(getSuggestedDescription(category, profile));
        }
      } catch (e) {
        console.warn('Image analysis failed:', e);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPreview]);

  const activeColorProfile = photoPreview ? colorProfile : null;

  // Auto-fill title from GPS place name if name is empty (adjusted during render
  // when the place name changes, instead of in an effect)
  const [filledFromPlace, setFilledFromPlace] = useState(undefined);
  if (location?.placeName !== filledFromPlace) {
    setFilledFromPlace(location?.placeName);
    if (location?.placeName && !gemName) setGemName(location.placeName);
  }

  const state = { photoFile, location, gemName, category, description, safetyAck };

  const handleNext = () => {
    if (stepValid(wizardStep, state)) setWizardStep(s => s + 1);
  };

  const handleBack = () => setWizardStep(s => Math.max(1, s - 1));

  // Shared by both the header's back arrow and the hardware back button:
  // step back one wizard step if mid-flow, otherwise confirm before
  // discarding an in-progress gem and leaving the wizard entirely.
  // Returns true if the press/tap was consumed (stay on this screen).
  const consumeBackPress = () => {
    if (wizardStep > 1 && wizardStep <= TOTAL_STEPS) {
      handleBack();
      return true;
    }
    if (wizardStep === 1 && photoFile) {
      return !confirm('Discard this gem? Your photo and any details you entered will be lost.');
    }
    return false;
  };

  const handleHeaderBack = () => {
    if (consumeBackPress()) return;
    navigate('/');
  };

  // Claim the Android hardware back button while the wizard is on-screen:
  // wizard steps live in local state, not the URL, so without this a
  // back-press would fall through to router history and jump straight out
  // of the whole flow instead of stepping back one step (see
  // src/lib/hardwareBack.js).
  useEffect(() => {
    return registerBackInterceptor(consumeBackPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, photoFile]);

  const handleSubmit = async () => {
    if (!stepValid(TOTAL_STEPS, state)) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await dropGem({
        imageFile: photoFile,
        cameraBase64,
        videoFile,
        location,
        title: gemName.trim(),
        category,
        description: description.trim(),
        tags: selectedTags,
        address: location?.address || '',
        vibeRatings,
        user,
      });

      if (result.offline) {
        setDroppedGem({ title: gemName, category, description, image_url: photoPreview, offline: true });
      } else {
        setDroppedGem(result.spot || { title: gemName, category, description, image_url: photoPreview });
        // Trigger badge check
        setTimeout(() => { if (user) checkBadges(user); }, 600);
      }
      setWizardStep(TOTAL_STEPS + 1);
    } catch (err) {
      console.error('Drop gem error:', err);
      setSubmitError(err?.message || 'Something went wrong. Your details are still here — try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareCard = () => {
    if (!droppedGem) return;
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
    gradient.addColorStop(0, '#2C3531'); gradient.addColorStop(1, '#111714');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 800, 1200);

    ctx.fillStyle = '#FFFFFF'; ctx.font = "bold 32px 'Archivo Variable', sans-serif";
    ctx.textAlign = 'center'; ctx.fillText('💎 S P O T A', 400, 80);

    const drawDetails = () => {
      ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
      ctx.font = "bold 38px 'Archivo Variable', sans-serif";
      ctx.fillText(droppedGem.title || 'New Gem', 120, 685, 560);

      const catInfo = getCategoryById(droppedGem.category);
      const catText = `${catInfo.emoji} ${catInfo.label}`.toUpperCase();
      ctx.fillStyle = catInfo.color;
      const pillW = ctx.measureText(catText).width + 24;
      ctx.beginPath(); ctx.roundRect(120, 715, pillW, 32, 16); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = "bold 13px 'Archivo Variable', sans-serif";
      ctx.fillText(catText, 132, 736);

      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = "italic 20px 'Archivo Variable', sans-serif";
      const words = `"${droppedGem.description || ''}"`.split(' ');
      let line = ''; let lY = 790;
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > 520 && line) { ctx.fillText(line, 120, lY); line = word + ' '; lY += 28; }
        else line = test;
      }
      ctx.fillText(line, 120, lY);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `spota_${(droppedGem.title || 'gem').toLowerCase().replace(/\s+/g,'_')}_card.png`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }, 'image/png');
    };

    if (droppedGem.image_url) {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = droppedGem.image_url;
      img.onload = () => {
        ctx.save();
        const rx=80,ry=150,rw=640,rh=440,rr=24;
        ctx.beginPath(); ctx.moveTo(rx+rr,ry); ctx.arcTo(rx+rw,ry,rx+rw,ry+rh,rr);
        ctx.arcTo(rx+rw,ry+rh,rx,ry+rh,rr); ctx.arcTo(rx,ry+rh,rx,ry,rr); ctx.arcTo(rx,ry,rx+rw,ry,rr);
        ctx.closePath(); ctx.clip(); ctx.drawImage(img,rx,ry,rw,rh); ctx.restore();
        drawDetails();
      };
      img.onerror = () => { ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(80,150,640,440); drawDetails(); };
    } else {
      ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(80,150,640,440); drawDetails();
    }
  };

  const handleDropAnother = () => {
    setWizardStep(1);
    setPhotoFile(null); setPhotoPreview(null); setPhotoFilter('none'); setCameraBase64(null);
    setVideoFile(null); setVideoPreview(null);
    setPhotoGps(null);
    setLocation(null);
    setGemName(''); setCategory('cafe');
    setVibeRatings({ cozy:3, insta_worthy:3, lively:3, zen:3, workspace:3 });
    setDescription(''); setSelectedTags([]);
    setSafetyAck(false); setSubmitError(null);
    setColorProfile(null); setDroppedGem(null);
  };

  const stepProps = {
    // Step 1
    photoFile, setPhotoFile, photoPreview, setPhotoPreview,
    photoFilter, setPhotoFilter, cameraBase64, setCameraBase64,
    videoFile, setVideoFile, videoPreview, setVideoPreview,
    onExifGps: setPhotoGps,  // EXIF GPS extracted before canvas compression
    // Step 2
    location, setLocation, photoGps,
    // Step 3
    gemName, setGemName, category, setCategory, colorProfile: activeColorProfile, description, setDescription,
    // Step 4
    vibeRatings, setVibeRatings,
    // Step 5
    selectedTags, setSelectedTags,
    // Step 6
    safetyAck, setSafetyAck, onEditStep: setWizardStep,
  };

  const inWizard = wizardStep <= TOTAL_STEPS;

  return (
    <div className="add-gem-wizard-shell">
      {inWizard && (
        <div className="wizard-header-row">
          <button
            type="button"
            className="wizard-header-back-btn"
            onClick={handleHeaderBack}
            aria-label={wizardStep > 1 ? 'Previous step' : 'Close'}
          >
            <X size={20} />
          </button>
          <span className="wizard-header-title">Drop a SPOTA</span>
          <span className="wizard-header-count sp-mono">{wizardStep}/{TOTAL_STEPS}</span>
        </div>
      )}

      {inWizard && (
        <GemWizardProgress currentStep={wizardStep} totalSteps={TOTAL_STEPS} />
      )}

      <div className="wizard-step-content">
        {wizardStep === 1 && <StepCapture {...stepProps} />}
        {wizardStep === 2 && <StepPin {...stepProps} />}
        {wizardStep === 3 && <StepName {...stepProps} />}
        {wizardStep === 4 && <StepRate {...stepProps} />}
        {wizardStep === 5 && <StepVibe {...stepProps} />}
        {wizardStep === 6 && <StepReview {...stepProps} />}
        {wizardStep === TOTAL_STEPS + 1 && (
          <StepCelebrate
            gem={droppedGem}
            onShareCard={handleShareCard}
            onDropAnother={handleDropAnother}
          />
        )}
        {submitError && inWizard && (
          <div className="wizard-error" role="alert">
            <AlertTriangle size={16} />
            <span><strong>Couldn&apos;t publish.</strong> {submitError}</span>
          </div>
        )}
      </div>

      {inWizard && (
        <GemWizardCTA
          step={wizardStep}
          totalSteps={TOTAL_STEPS}
          onBack={handleBack}
          onNext={handleNext}
          canAdvance={stepValid(wizardStep, state)}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
