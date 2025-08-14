This folder contains the in-app tutorial.

Active components:
- TutorialOverlay.tsx (main overlay)
- TutorialManager.tsx
- TutorialWelcomeModal.tsx

Deprecated components (kept for reference, safe to delete once verified):
- SimpleTutorialOverlay.tsx
- ProperTutorialOverlay.tsx
- RobustTutorialOverlay.tsx

Notes:
- The main overlay implements reduced-motion support, focus management (dialog role, aria-labelledby), and robust highlight positioning.
- Right panel subtabs expose data-tutorial targets for precise steps.
