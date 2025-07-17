
import React from 'react';
import { 
  AlertTriangle, 
  Users, 
  MessageSquare, 
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  UserX,
  Shield
} from 'lucide-react';

export const ModerationDashboard = () => {
  const metricCards = [
    {
      title: 'Reports Awaiting Review',
      value: '47',
      trend: 'up',
      change: '+12',
      icon: Clock,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
      borderColor: 'border-yellow-400/20'
    },
    {
      title: 'Reports Resolved Today',
      value: '89',
      trend: 'up',
      change: '+23',
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      borderColor: 'border-green-400/20'
    },
    {
      title: 'Users Banned Today',
      value: '3',
      trend: 'down',
      change: '-2',
      icon: UserX,
      color: 'text-red-400',
      bgColor: 'bg-red-400/10',
      borderColor: 'border-red-400/20'
    },
    {
      title: 'Active Moderators Online',
      value: '12',
      trend: 'up',
      change: '+3',
      icon: Shield,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      borderColor: 'border-blue-400/20'
    }
  ];

  const recentActivity = [
    {
      moderator: 'admin_sarah',
      action: 'Deleted message from user_123',
      time: '2 min ago',
      type: 'delete'
    },
    {
      moderator: 'mod_james',
      action: 'Banned user_456',
      time: '5 min ago',
      type: 'ban'
    },
    {
      moderator: 'admin_mike',
      action: 'Approved character "Fire Mage"',
      time: '8 min ago',
      type: 'approve'
    },
    {
      moderator: 'mod_lisa',
      action: 'Warned user_789 for spam',
      time: '12 min ago',
      type: 'warn'
    },
    {
      moderator: 'admin_sarah',
      action: 'Resolved report #1284',
      time: '15 min ago',
      type: 'resolve'
    },
    {
      moderator: 'mod_james',
      action: 'Deleted inappropriate content',
      time: '18 min ago',
      type: 'delete'
    },
    {
      moderator: 'admin_mike',
      action: 'Updated community guidelines',
      time: '25 min ago',
      type: 'update'
    },
    {
      moderator: 'mod_lisa',
      action: 'Reviewed user profile reports',
      time: '32 min ago',
      type: 'review'
    }
  ];

  const getActionTypeColor = (type: string) => {
    switch (type) {
      case 'ban': return 'text-red-400';
      case 'delete': return 'text-red-400';
      case 'approve': return 'text-green-400';
      case 'resolve': return 'text-blue-400';
      case 'warn': return 'text-yellow-400';
      case 'update': return 'text-purple-400';
      case 'review': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Moderation Dashboard</h1>
          <p className="text-gray-400 mt-1">Monitor and manage platform activity</p>
        </div>
        <div className="text-sm text-gray-400">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((card) => {
          const Icon = card.icon;
          const TrendIcon = card.trend === 'up' ? ArrowUp : ArrowDown;
          return (
            <div 
              key={card.title}
              className={`${card.bgColor} border ${card.borderColor} rounded-lg p-6`}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className={`w-8 h-8 ${card.color}`} />
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  card.trend === 'up' ? 'text-green-400' : 'text-red-400'
                }`}>
                  <TrendIcon className="w-4 h-4" />
                  <span>{card.change}</span>
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold text-white mb-2">{card.value}</p>
                <p className="text-sm text-gray-400">{card.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Moderation Actions */}
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Moderation Actions</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentActivity.map((item, index) => (
              <div key={index} className="flex items-start gap-4 p-3 bg-[#0A0B0F] rounded-lg border border-gray-700/30">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  item.type === 'ban' || item.type === 'delete' ? 'bg-red-400' :
                  item.type === 'approve' ? 'bg-green-400' :
                  item.type === 'warn' ? 'bg-yellow-400' :
                  item.type === 'resolve' ? 'bg-blue-400' : 'bg-gray-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#FF7A00] font-medium text-sm">{item.moderator}</span>
                    <span className="text-gray-500 text-xs">•</span>
                    <span className="text-gray-500 text-xs">{item.time}</span>
                  </div>
                  <p className={`text-sm ${getActionTypeColor(item.type)}`}>{item.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full flex items-center gap-3 p-4 bg-[#FF7A00]/10 border border-[#FF7A00]/20 rounded-lg text-left hover:bg-[#FF7A00]/20 transition-colors">
              <Eye className="w-5 h-5 text-[#FF7A00]" />
              <div>
                <p className="text-white font-medium">Review Flagged Content</p>
                <p className="text-gray-400 text-sm">47 items pending review</p>
              </div>
            </button>
            
            <button className="w-full flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-left hover:bg-red-500/20 transition-colors">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-white font-medium">High Priority Reports</p>
                <p className="text-gray-400 text-sm">3 urgent items</p>
              </div>
            </button>
            
            <button className="w-full flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-left hover:bg-blue-500/20 transition-colors">
              <Users className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-white font-medium">User Management</p>
                <p className="text-gray-400 text-sm">Manage user accounts</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
