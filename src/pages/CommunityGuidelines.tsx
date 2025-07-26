import React from 'react';
import { Shield, Gavel, Ban, Eye, AlertTriangle, Heart, Clock, Hammer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TopBar } from '@/components/ui/TopBar';
import { useNavigate } from 'react-router-dom';

const CommunityGuidelines = () => {
  const navigate = useNavigate();
  const coreRules = [
    {
      id: 'no-jerk',
      title: "Don't Be a Jerk",
      icon: Ban,
      description: "No harassment, hate speech, bullying, or personal attacks. We're here to create, not to tear down.",
      color: 'text-red-400'
    },
    {
      id: 'keep-legal',
      title: 'Keep It Legal',
      icon: Gavel,
      description: "No illegal content. Respect copyright and intellectual property. Don't post stuff that isn't yours.",
      color: 'text-blue-400'
    },
    {
      id: 'no-spam',
      title: 'No Spam, No Scams',
      icon: Ban,
      description: "No unsolicited advertising, phishing links, or spamming. Self-promotion of your characters is cool; shilling crypto isn't.",
      color: 'text-yellow-400'
    },
    {
      id: 'protect-privacy',
      title: 'Protect Privacy',
      icon: Shield,
      description: "Doxxing or sharing anyone's private information without their consent is an instant ban. No exceptions.",
      color: 'text-green-400'
    },
    {
      id: 'tag-content',
      title: 'Tag Your Content',
      icon: Eye,
      description: "Clearly tag NSFW content. Not everyone wants to see that, so be respectful. Mis-tagging will be treated as a rule violation.",
      color: 'text-purple-400'
    }
  ];

  const consequences = [
    {
      step: 1,
      title: 'The Warning',
      description: 'A friendly but firm notice from a mod.',
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10'
    },
    {
      step: 2,
      title: 'The Timeout',
      description: 'A temporary suspension from the platform.',
      icon: Clock,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10'
    },
    {
      step: 3,
      title: 'The Ban',
      description: 'Permanent removal from the community.',
      icon: Ban,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0F1117] text-white">
      {/* Standardized TopBar */}
      <TopBar
        title="Community Guidelines"
        subtitle="These are the rules of engagement. Follow them, and we'll all have an amazing time."
        leftContent={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-gray-300 hover:text-white hover:bg-gray-700/50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        }
        rightContent={
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#FF7A00]/10 rounded-full">
            <Shield className="w-5 h-5 text-[#FF7A00]" />
          </div>
        }
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Introduction */}
        <div className="mb-12">
          <Card className="bg-[#1A1D23] border-gray-700/50">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Welcome to the <span className="text-[#FF7A00]">AI Character Community</span>
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-4">
                We've built something special here—a place where creativity meets technology, where stories come alive, 
                and where every conversation can be an adventure. These guidelines aren't here to kill the fun; 
                they're here to make sure everyone gets to enjoy it.
              </p>
              <p className="text-gray-300 text-lg leading-relaxed">
                Think of this like the rules of any good game: <span className="text-[#FF7A00] font-semibold">clear, fair, and designed to keep things awesome for everyone</span>.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Core Rules */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">The Core Rules</h2>
          <div className="space-y-6">
            {coreRules.map((rule, index) => {
              const Icon = rule.icon;
              return (
                <Card key={rule.id} className="bg-[#1A1D23] border-gray-700/50 hover:border-[#FF7A00]/30 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-6">
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 bg-[#FF7A00]/10 rounded-full flex items-center justify-center">
                          <Icon className={`w-8 h-8 ${rule.color}`} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl font-bold text-[#FF7A00]">Rule {index + 1}:</span>
                          <h3 className="text-2xl font-bold text-white">{rule.title}</h3>
                        </div>
                        <p className="text-gray-300 text-lg leading-relaxed">{rule.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Consequence System */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 rounded-full mb-4">
              <Hammer className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">The Banhammer: How We Enforce Rules</h2>
            <p className="text-xl text-gray-300">
              Fair consequences, clearly explained. We believe in second chances, but we also believe in consequences.
            </p>
          </div>

          {/* Three-Step Visual */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {consequences.map((consequence, index) => {
              const Icon = consequence.icon;
              return (
                <Card key={consequence.step} className="bg-[#1A1D23] border-gray-700/50 relative">
                  <CardContent className="p-6 text-center">
                    {/* Step Number */}
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="w-8 h-8 bg-[#FF7A00] rounded-full flex items-center justify-center text-white font-bold">
                        {consequence.step}
                      </div>
                    </div>
                    
                    {/* Icon */}
                    <div className={`w-16 h-16 ${consequence.bgColor} rounded-full flex items-center justify-center mx-auto mb-4 mt-2`}>
                      <Icon className={`w-8 h-8 ${consequence.color}`} />
                    </div>
                    
                    {/* Content */}
                    <h3 className="text-xl font-bold text-white mb-3">{consequence.title}</h3>
                    <p className="text-gray-300 text-lg">{consequence.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Arrow Connectors (Desktop Only) */}
          <div className="hidden md:flex justify-center items-center mb-8 -mt-4">
            <div className="flex items-center space-x-8">
              <div className="w-20 h-0.5 bg-gradient-to-r from-yellow-400 to-orange-400"></div>
              <div className="w-20 h-0.5 bg-gradient-to-r from-orange-400 to-red-400"></div>
            </div>
          </div>

          {/* Severity Notice */}
          <Card className="bg-gradient-to-r from-red-500/10 to-red-600/5 border-red-500/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white mb-2">⚠️ Immediate Ban Violations</h4>
                  <p className="text-gray-300 text-lg">
                    <span className="text-red-400 font-semibold">Severe violations</span> (like illegal content or doxxing) 
                    will result in an <span className="text-[#FF7A00] font-semibold">immediate, permanent ban</span>. 
                    We don't play around with safety.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reporting Section */}
        <Card className="bg-[#1A1D23] border-gray-700/50 mb-12">
          <CardContent className="p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Ban className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">See Something? Say Something.</h3>
                <p className="text-gray-400 text-lg">Help us keep the community awesome by reporting issues.</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-lg leading-relaxed">
                If you encounter content or behavior that violates these guidelines, don't hesitate to report it. 
                Our moderation team reviews every report and takes appropriate action.
              </p>
              <p className="text-gray-300 text-lg leading-relaxed">
                <span className="text-[#FF7A00] font-semibold">False reports are taken seriously</span> and may result in action against your account.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="bg-gradient-to-r from-[#FF7A00]/5 to-[#FF7A00]/10 border-[#FF7A00]/20">
          <CardContent className="p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-4">Ready to Dive In?</h3>
            <p className="text-gray-300 text-lg mb-6 max-w-2xl mx-auto">
              These guidelines are living rules—they evolve as our community grows. 
              When in doubt, just remember: <span className="text-[#FF7A00] font-semibold">be excellent to each other</span>.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                className="bg-[#FF7A00] hover:bg-[#FF7A00]/80 text-white px-6 py-3 text-lg"
                onClick={() => window.history.back()}
              >
                Got It, Let's Go!
              </Button>
              <Button 
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-700 px-6 py-3 text-lg"
                onClick={() => window.open('mailto:support@example.com', '_blank')}
              >
                Questions? Contact Us
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CommunityGuidelines;
