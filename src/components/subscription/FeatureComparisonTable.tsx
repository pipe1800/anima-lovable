import React from 'react';
import { CheckCircle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  monthly_credits_allowance: number;
  features: any;
  is_active: boolean;
}

interface FeatureComparisonTableProps {
  plans: Plan[];
}

interface FeatureRow {
  label: string;
  key: string;
  type: 'boolean' | 'value' | 'credits' | 'price';
  getValue?: (plan: Plan) => string | number | boolean;
}

const featureRows: FeatureRow[] = [
  {
    label: 'Monthly Price',
    key: 'price',
    type: 'price',
    getValue: (plan) => plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly}`
  },
  {
    label: 'Monthly Credits',
    key: 'credits',
    type: 'credits',
    getValue: (plan) => plan.monthly_credits_allowance.toLocaleString()
  },
  {
    label: 'Character Creation',
    key: 'character_creation',
    type: 'boolean',
    getValue: (plan) => true // All plans have this
  },
  {
    label: 'Chat with Characters',
    key: 'chat_feature',
    type: 'boolean',
    getValue: (plan) => true // All plans have this
  },
  {
    label: 'Basic AI Models',
    key: 'basic_models',
    type: 'boolean',
    getValue: (plan) => true // All plans have this
  },
  {
    label: 'Advanced AI Models',
    key: 'advanced_models',
    type: 'boolean',
    getValue: (plan) => plan.price_monthly > 0 // Only paid plans
  },
  {
    label: 'Custom Personas',
    key: 'custom_personas',
    type: 'value',
    getValue: (plan) => {
      if (plan.price_monthly === 0) return '1';
      if (plan.name === 'True Fan') return '5';
      if (plan.name === 'The Whale') return '10';
      return '1';
    }
  },
  {
    label: 'World Info Access',
    key: 'world_info',
    type: 'boolean',
    getValue: (plan) => plan.price_monthly > 0 // Only paid plans
  },
  {
    label: 'Credit Booster Packs',
    key: 'credit_boosters',
    type: 'boolean',
    getValue: (plan) => plan.price_monthly > 0 // Only paid plans
  },
  {
    label: 'Add-ons',
    key: 'addons',
    type: 'boolean',
    getValue: (plan) => plan.name === 'True Fan' || plan.name === 'The Whale'
  },
  {
    label: 'Priority Generation',
    key: 'priority_generation',
    type: 'boolean',
    getValue: (plan) => plan.name === 'The Whale' // Only highest tier
  }
];

export const FeatureComparisonTable: React.FC<FeatureComparisonTableProps> = ({ plans }) => {
  if (!plans || plans.length === 0) {
    return null;
  }

  const activePlans = plans.filter(plan => plan.is_active);

  const renderFeatureCell = (plan: Plan, feature: FeatureRow) => {
    const value = feature.getValue ? feature.getValue(plan) : false;
    
    if (feature.type === 'boolean') {
      return value ? (
        <div className="flex justify-center">
          <CheckCircle className="w-5 h-5 text-green-500" />
        </div>
      ) : (
        <div className="flex justify-center">
          <X className="w-5 h-5 text-gray-500" />
        </div>
      );
    }

    if (feature.type === 'price' || feature.type === 'credits' || feature.type === 'value') {
      return (
        <div className="text-center font-medium text-white">
          {value}
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="bg-[#1a1a2e] border-gray-700/50 overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl text-white text-center">
          Plan Comparison
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Header Row */}
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-6 text-gray-300 font-medium min-w-[200px]">
                  Features
                </th>
                {activePlans.map((plan) => (
                  <th key={plan.id} className="text-center py-4 px-6 min-w-[140px]">
                    <div className="space-y-2">
                      <div className="text-lg font-bold text-white">
                        {plan.name}
                      </div>
                      <div className={`text-sm px-3 py-1 rounded-full ${
                        plan.name === 'True Fan' 
                          ? 'bg-[#FF7A00] text-white' 
                          : plan.name === 'The Whale'
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly}/mo`}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Feature Rows */}
            <tbody>
              {featureRows.map((feature, index) => (
                <tr 
                  key={feature.key} 
                  className={`border-b border-gray-700/30 ${
                    index % 2 === 0 ? 'bg-gray-800/20' : 'bg-transparent'
                  }`}
                >
                  <td className="py-4 px-6 text-gray-300 font-medium">
                    {feature.label}
                  </td>
                  {activePlans.map((plan) => (
                    <td key={plan.id} className="py-4 px-6">
                      {renderFeatureCell(plan, feature)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Additional Notes */}
        <div className="mt-6 pt-6 border-t border-gray-700/50">
          <div className="text-sm text-gray-400 space-y-2">
            <p>• All features are included for the lifetime of your subscription</p>
            <p>• Credits reset monthly and do not roll over</p>
            <p>• Advanced AI models require True Fan or The Whale plan</p>
            <p>• Upgrade or downgrade at any time</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};