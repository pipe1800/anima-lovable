
import React from 'react';
import { Check, Circle } from 'lucide-react';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface CreationStepsSidebarProps {
  steps: Step[];
  currentStep: number;
  onStepChange: (stepId: number) => void;
}

const CreationStepsSidebar = ({ steps, currentStep, onStepChange }: CreationStepsSidebarProps) => {
  return (
    <div className="w-80 bg-[#1a1a2e]/90 backdrop-blur-sm border-r border-gray-700/50 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-700/50">
        <h2 className="text-[#FF7A00] font-bold text-xl mb-2">
          Creation Steps
        </h2>
        <p className="text-gray-400 text-sm">
          Follow these steps to bring your character to life
        </p>
      </div>

      {/* Steps List */}
      <div className="flex-1 p-6 space-y-4">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isUpcoming = step.id > currentStep;

          return (
            <div
              key={step.id}
              className={`relative cursor-pointer transition-all duration-300 ${
                isCurrent ? 'transform scale-105' : ''
              }`}
              onClick={() => onStepChange(step.id)}
            >
              {/* Connection Line */}
              {index < steps.length - 1 && (
                <div className={`absolute left-6 top-12 w-0.5 h-8 transition-colors duration-300 ${
                  isCompleted ? 'bg-[#FF7A00]' : 'bg-gray-600'
                }`} />
              )}

              <div className={`flex items-start space-x-4 p-4 rounded-xl border transition-all duration-300 ${
                isCurrent 
                  ? 'border-[#FF7A00] bg-[#FF7A00]/10 shadow-lg' 
                  : isCompleted
                    ? 'border-green-500/50 bg-green-500/5 hover:bg-green-500/10'
                    : 'border-gray-600/50 bg-gray-800/20 hover:bg-gray-800/40'
              }`}>
                {/* Step Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-500 text-white shadow-lg'
                    : isCurrent
                      ? 'bg-[#FF7A00] text-white shadow-lg animate-pulse'
                      : 'bg-gray-600 text-gray-300'
                }`}>
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Circle className={`w-4 h-4 ${isCurrent ? 'animate-spin-slow' : ''}`} />
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold transition-colors duration-300 ${
                    isCurrent 
                      ? 'text-[#FF7A00]' 
                      : isCompleted 
                        ? 'text-green-400' 
                        : 'text-gray-300'
                  }`}>
                    {step.title}
                  </h3>
                  <p className={`text-sm mt-1 transition-colors duration-300 ${
                    isCurrent 
                      ? 'text-[#FF7A00]/70' 
                      : 'text-gray-400'
                  }`}>
                    {step.description}
                  </p>
                </div>

                {/* Step Number */}
                <div className={`text-xs font-bold px-2 py-1 rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'bg-[#FF7A00] text-white'
                    : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-600 text-gray-300'
                }`}>
                  {step.id}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="p-6 border-t border-gray-700/50">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-gray-400">Progress</span>
          <span className="text-[#FF7A00] font-semibold">
            {Math.round((currentStep / steps.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-[#FF7A00] to-[#FF7A00]/70 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default CreationStepsSidebar;
