import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import './GemWizardCTA.css';

const NEXT_HINT = {
  1: 'Add a photo to continue',
  2: 'Set the pin to continue',
  3: 'Name it and pick a type',
  5: 'Write a line about it',
  6: 'Confirm it\'s safe & public',
};

export default function GemWizardCTA({ step, totalSteps = 6, onBack, onNext, canAdvance, onSubmit, isSubmitting }) {
  const isLastStep = step === totalSteps;

  return (
    <div className="wizard-cta">
      <button
        type="button"
        className="wizard-cta-back"
        onClick={onBack}
        disabled={step <= 1}
        aria-label="Previous step"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="wizard-cta-main">
        {!canAdvance && NEXT_HINT[step] && <span className="wizard-cta-hint">{NEXT_HINT[step]}</span>}
        {isLastStep ? (
          <button
            type="button"
            className="wizard-cta-next is-publish"
            onClick={onSubmit}
            disabled={!canAdvance || isSubmitting}
          >
            {isSubmitting ? <><span className="wizard-cta-spinner" /> Publishing…</> : <><Send size={16} /> Publish SPOTA</>}
          </button>
        ) : (
          <button
            type="button"
            className="wizard-cta-next"
            onClick={onNext}
            disabled={!canAdvance}
          >
            {step === totalSteps - 1 ? 'Review' : 'Next'} <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
