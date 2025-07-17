
import React, { useState } from 'react';
import { BookOpen, Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ModerationRules = () => {
  const [activeCategory, setActiveCategory] = useState('content');

  const ruleCategories = [
    { id: 'content', label: 'Content Guidelines' },
    { id: 'behavior', label: 'User Behavior' },
    { id: 'community', label: 'Community Standards' },
    { id: 'spam', label: 'Spam & Abuse' }
  ];

  const rules = {
    content: [
      {
        id: 1,
        title: 'Inappropriate Content',
        description: 'Content that contains explicit sexual material, excessive violence, or graphic imagery is prohibited.',
        severity: 'high',
        autoAction: 'Remove immediately',
        created: '2024-01-15'
      },
      {
        id: 2,
        title: 'Copyright Violation',
        description: 'Using copyrighted material without permission, including characters, images, or text.',
        severity: 'high',
        autoAction: 'Flag for review',
        created: '2024-01-20'
      },
      {
        id: 3,
        title: 'Misleading Information',
        description: 'Spreading false or misleading information that could harm users or the platform.',
        severity: 'medium',
        autoAction: 'Flag for review',
        created: '2024-02-01'
      }
    ],
    behavior: [
      {
        id: 4,
        title: 'Harassment',
        description: 'Targeting individuals with abusive, threatening, or intimidating behavior.',
        severity: 'high',
        autoAction: 'Temporary suspension',
        created: '2024-01-10'
      },
      {
        id: 5,
        title: 'Impersonation',
        description: 'Pretending to be someone else or creating fake accounts.',
        severity: 'medium',
        autoAction: 'Account verification required',
        created: '2024-01-25'
      }
    ],
    community: [
      {
        id: 6,
        title: 'Respect Guidelines',
        description: 'All users must treat others with respect and courtesy.',
        severity: 'low',
        autoAction: 'Warning issued',
        created: '2024-01-05'
      }
    ],
    spam: [
      {
        id: 7,
        title: 'Promotional Content',
        description: 'Excessive self-promotion or advertising without permission.',
        severity: 'medium',
        autoAction: 'Content removed',
        created: '2024-02-10'
      }
    ]
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'low': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const currentRules = rules[activeCategory as keyof typeof rules] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Moderation Rules</h1>
          <p className="text-gray-400 mt-1">Manage platform policies and guidelines</p>
        </div>
        <Button className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 border-b border-gray-700/50">
        {ruleCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeCategory === category.id
                ? 'border-[#FF7A00] text-[#FF7A00]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {currentRules.map((rule) => (
          <div key={rule.id} className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-semibold text-white">{rule.title}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(rule.severity)}`}>
                    {rule.severity} priority
                  </span>
                </div>
                
                <p className="text-gray-300 mb-4">{rule.description}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Auto Action:</span>
                    <p className="text-white font-medium">{rule.autoAction}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Created:</span>
                    <p className="text-white font-medium">{rule.created}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-4">
                <Button 
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  className="border-red-600 text-red-400 hover:bg-red-600/10"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rule Statistics */}
      <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Rule Enforcement Statistics
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400 mb-1">127</div>
            <div className="text-sm text-gray-400">Violations This Week</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400 mb-1">89%</div>
            <div className="text-sm text-gray-400">Auto-Resolution Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400 mb-1">2.3min</div>
            <div className="text-sm text-gray-400">Avg Response Time</div>
          </div>
        </div>
      </div>
    </div>
  );
};
