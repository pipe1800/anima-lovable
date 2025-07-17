import React from 'react';
import { Check, Circle } from 'lucide-react';
interface Step {
  id: number;
  title: string;
  description: string;
}
interface CreationStepsHeaderProps {
  steps: Step[];
  currentStep: number;
  onStepChange: (stepId: number) => void;
}
const CreationStepsHeader = ({
  steps,
  currentStep,
  onStepChange
}: CreationStepsHeaderProps) => {
  return <div className="bg-[#1a1a2e]/90 backdrop-blur-sm border-b border-gray-700/50 py-[4px]">
      <div className="">
        <div className="mb-6 hidden sm:block px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Character Creator
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">
            Create your AI character in {steps.length} simple steps
          </p>
        </div>

        {/* Steps Progress Bar */}
        <div className="flex items-center justify-between relative px-4 sm:px-6 lg:px-8">
          {/* Progress Line - hidden on mobile */}
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-600 -z-10 hidden sm:block">
            <div className="h-full bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 transition-all duration-500" style={{
            width: `${(currentStep - 1) / (steps.length - 1) * 100}%`
          }} />
          </div>

          {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isUpcoming = step.id > currentStep;
          return <div key={step.id} className={`flex flex-col items-center cursor-pointer transition-all duration-300 ${isCurrent ? 'transform scale-105' : ''} flex-1 sm:flex-none sm:min-w-0`} onClick={() => onStepChange(step.id)}>
                {/* Step Circle */}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 mb-2 sm:mb-3 ${isCompleted ? 'bg-green-500 text-white shadow-lg' : isCurrent ? 'bg-[#FF7A00] text-white shadow-lg animate-pulse' : 'bg-gray-600 text-gray-300'}`} style={isCurrent ? {
              animationDuration: '2s'
            } : {}}>
                  {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className={`w-4 h-4 sm:w-5 sm:h-5 ${isCurrent ? 'animate-spin-slow' : ''}`} />}
                </div>

                {/* Step Info */}
                <div className="text-center max-w-full">
                  <h3 className={`font-semibold text-xs sm:text-sm transition-colors duration-300 truncate ${isCurrent ? 'text-[#FF7A00]' : isCompleted ? 'text-green-400' : 'text-gray-300'}`}>
                    {step.title}
                  </h3>
                  <p className={`text-xs mt-1 transition-colors duration-300 hidden sm:block truncate ${isCurrent ? 'text-[#FF7A00]/70' : 'text-gray-400'}`}>
                    {step.description}
                  </p>
                </div>
              </div>;
        })}
        </div>
      </div>
    </div>;
};
export default CreationStepsHeader;