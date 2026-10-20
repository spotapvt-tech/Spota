import './GemWizardProgress.css';

const STEP_LABELS = ['Photo', 'Pin', 'Name', 'Rate', 'Story', 'Review'];

/** Segmented trail: one segment per step, current step labelled below. */
export default function GemWizardProgress({ currentStep, totalSteps = 6 }) {
  return (
    <div className="wizard-progress" aria-label={`Step ${currentStep} of ${totalSteps}: ${STEP_LABELS[currentStep - 1]}`}>
      <div className="wizard-progress__track">
        {Array.from({ length: totalSteps }, (_, i) => {
          const n = i + 1;
          const state = currentStep > n ? 'done' : currentStep === n ? 'active' : '';
          return <span key={n} className={`wizard-progress__seg ${state}`} />;
        })}
      </div>
      <div className="wizard-progress__labels" aria-hidden="true">
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => (
          <span key={label} className={currentStep === i + 1 ? 'active' : currentStep > i + 1 ? 'done' : ''}>{label}</span>
        ))}
      </div>
    </div>
  );
}
