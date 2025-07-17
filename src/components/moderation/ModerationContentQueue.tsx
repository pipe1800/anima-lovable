import React, { useState } from 'react';
import { AlertTriangle, Clock, User, MessageSquare, CheckCircle, XCircle, Filter, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, AlertCircle, Ban, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QueueItem {
  id: number;
  contentType: 'character' | 'message' | 'profile';
  reportedUser: string;
  reportedBy: string;
  reason: string;
  date: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-review' | 'resolved';
  content?: string;
  details?: string;
  contextMessages?: Array<{
    id: number;
    username: string;
    message: string;
    timestamp: string;
    isReported?: boolean;
  }>;
  characterProfile?: {
    avatar: string;
    name: string;
    description: string;
    greeting: string;
    tags: string[];
  };
}

export const ModerationContentQueue = () => {
  const [sortColumn, setSortColumn] = useState<keyof QueueItem>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);

  const queueItems: QueueItem[] = [
    {
      id: 1,
      contentType: 'character',
      reportedUser: 'darkassassin92',
      reportedBy: 'user123',
      reason: 'Inappropriate content',
      date: '2024-01-15 14:30',
      priority: 'high',
      status: 'pending',
      content: 'Character: "Dark Assassin" with inappropriate backstory',
      details: 'Character contains explicit violent content unsuitable for platform',
      characterProfile: {
        avatar: '/placeholder.svg',
        name: 'Dark Assassin',
        description: 'A mysterious figure who strikes from the shadows with deadly precision. Born in the darkest corners of the underworld...',
        greeting: 'Well, well... another soul seeks to dance with death. Are you prepared for what lurks in the darkness?',
        tags: ['Dark', 'Assassin', 'Mystery', 'Violence']
      }
    },
    {
      id: 2,
      contentType: 'message',
      reportedUser: 'spammer001',
      reportedBy: 'moderator',
      reason: 'Spam/Advertisement',
      date: '2024-01-15 14:15',
      priority: 'medium',
      status: 'pending',
      content: 'Message: "Check out my website for amazing deals!!!"',
      details: 'User posting promotional content in chat channels',
      contextMessages: [
        {
          id: 1,
          username: 'user456',
          message: 'Hey everyone, how are you doing today?',
          timestamp: '14:12'
        },
        {
          id: 2,
          username: 'regularuser',
          message: 'Pretty good! Just chatting with my AI character.',
          timestamp: '14:13'
        },
        {
          id: 3,
          username: 'spammer001',
          message: 'Check out my website for amazing deals!!! Visit dealsite.com now for 50% off everything!',
          timestamp: '14:14',
          isReported: true
        },
        {
          id: 4,
          username: 'anotheruser',
          message: 'That looks like spam...',
          timestamp: '14:15'
        }
      ]
    },
    {
      id: 3,
      contentType: 'profile',
      reportedUser: 'john_doe',
      reportedBy: 'user456',
      reason: 'Fake account',
      date: '2024-01-15 13:00',
      priority: 'low',
      status: 'in-review',
      content: 'Profile with suspicious activity patterns',
      details: 'Account created recently with unusual engagement patterns'
    },
    {
      id: 4,
      contentType: 'character',
      reportedUser: 'evilqueen88',
      reportedBy: 'user789',
      reason: 'Copyright violation',
      date: '2024-01-15 12:45',
      priority: 'high',
      status: 'resolved',
      content: 'Character: "Evil Queen" using copyrighted material',
      details: 'Character uses Disney copyrighted imagery without permission'
    },
    {
      id: 5,
      contentType: 'message',
      reportedUser: 'toxicuser',
      reportedBy: 'user999',
      reason: 'Harassment',
      date: '2024-01-15 12:30',
      priority: 'high',
      status: 'pending',
      content: 'Message containing threatening language',
      details: 'User sending threatening messages to other community members'
    }
  ];

  const handleSort = (column: keyof QueueItem) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: keyof QueueItem) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const filteredAndSortedItems = queueItems
    .filter(item => {
      const contentTypeMatch = contentTypeFilter === 'all' || item.contentType === contentTypeFilter;
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      return contentTypeMatch && statusMatch;
    })
    .sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * direction;
      }
      return 0;
    });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-400/10';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10';
      case 'low': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400 bg-yellow-400/10';
      case 'in-review': return 'text-blue-400 bg-blue-400/10';
      case 'resolved': return 'text-green-400 bg-green-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'character': return User;
      case 'message': return MessageSquare;
      case 'profile': return User;
      default: return AlertTriangle;
    }
  };

  const handleModerationAction = (action: string, item: QueueItem) => {
    console.log(`Performing ${action} on item ${item.id} for user ${item.reportedUser}`);
    // Here you would implement the actual moderation actions
  };

  const renderEvidenceColumn = (item: QueueItem) => {
    switch (item.contentType) {
      case 'message':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Message Context</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {item.contextMessages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg border ${
                    msg.isReported
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-[#0A0B0F] border-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium text-sm ${
                      msg.isReported ? 'text-red-400' : 'text-[#FF7A00]'
                    }`}>
                      {msg.username}
                    </span>
                    <span className="text-gray-500 text-xs">{msg.timestamp}</span>
                    {msg.isReported && (
                      <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                        REPORTED
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm">{msg.message}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'character':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Character Profile</h3>
            <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
              <div className="flex items-start gap-4 mb-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={item.characterProfile?.avatar} />
                  <AvatarFallback>{item.characterProfile?.name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="text-xl font-bold text-white">{item.characterProfile?.name}</h4>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.characterProfile?.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="bg-[#FF7A00]/10 text-[#FF7A00] text-xs px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400">Description</label>
                  <p className="text-gray-300 mt-1">{item.characterProfile?.description}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">Greeting</label>
                  <div className="bg-gray-800/50 p-3 rounded mt-1">
                    <p className="text-gray-300 italic">"{item.characterProfile?.greeting}"</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">User Profile</h3>
            <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-12 h-12">
                  <AvatarFallback>{item.reportedUser[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="text-lg font-bold text-white">{item.reportedUser}</h4>
                  <p className="text-gray-400 text-sm">Profile under review</p>
                </div>
              </div>
              <p className="text-gray-300">{item.details}</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-[#0A0B0F] border border-gray-700/50 rounded-lg p-4">
            <p className="text-gray-300">{item.content}</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Queue</h1>
          <p className="text-gray-400 mt-1">Review and moderate flagged content</p>
        </div>
        <div className="text-sm text-gray-400">
          {filteredAndSortedItems.length} items in queue
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 p-4 bg-[#1A1D23] border border-gray-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-300">Filters:</span>
        </div>
        
        <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
          <SelectTrigger className="w-40 bg-[#0A0B0F] border-gray-600 text-white">
            <SelectValue placeholder="Content Type" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1D23] border-gray-600">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="character">Character</SelectItem>
            <SelectItem value="message">Message</SelectItem>
            <SelectItem value="profile">Profile</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-[#0A0B0F] border-gray-600 text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1D23] border-gray-600">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in-review">In Review</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-[#1A1D23] border border-gray-700/50 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700/50 hover:bg-gray-800/50">
              <TableHead 
                className="text-gray-300 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('contentType')}
              >
                <div className="flex items-center gap-2">
                  Content Type
                  {getSortIcon('contentType')}
                </div>
              </TableHead>
              <TableHead 
                className="text-gray-300 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('reportedUser')}
              >
                <div className="flex items-center gap-2">
                  Reported User
                  {getSortIcon('reportedUser')}
                </div>
              </TableHead>
              <TableHead 
                className="text-gray-300 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('reportedBy')}
              >
                <div className="flex items-center gap-2">
                  Reported By
                  {getSortIcon('reportedBy')}
                </div>
              </TableHead>
              <TableHead 
                className="text-gray-300 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('reason')}
              >
                <div className="flex items-center gap-2">
                  Reason
                  {getSortIcon('reason')}
                </div>
              </TableHead>
              <TableHead 
                className="text-gray-300 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-2">
                  Date
                  {getSortIcon('date')}
                </div>
              </TableHead>
              <TableHead className="text-gray-300">Priority</TableHead>
              <TableHead className="text-gray-300">Status</TableHead>
              <TableHead className="text-gray-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedItems.map((item) => {
              const Icon = getContentTypeIcon(item.contentType);
              return (
                <Dialog key={item.id}>
                  <DialogTrigger asChild>
                    <TableRow 
                      className="border-gray-700/50 hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedItem(item)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-400" />
                          <span className="text-white capitalize">{item.contentType}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-[#FF7A00] font-medium">{item.reportedUser}</span>
                      </TableCell>
                      <TableCell className="text-gray-300">{item.reportedBy}</TableCell>
                      <TableCell className="text-gray-300">{item.reason}</TableCell>
                      <TableCell className="text-gray-400 text-sm">{item.date}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 border-green-600 text-green-400 hover:bg-green-600/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle approve action
                            }}
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                          <Button 
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 border-red-600 text-red-400 hover:bg-red-600/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle reject action
                            }}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </DialogTrigger>
                  
                  {/* Enhanced Two-Column Review Modal */}
                  <DialogContent className="bg-[#1A1D23] border-gray-700 text-white max-w-6xl max-h-[90vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold">Content Review - Case #{selectedItem?.id}</DialogTitle>
                    </DialogHeader>
                    
                    {selectedItem && (
                      <div className="flex gap-6 h-[calc(90vh-120px)]">
                        {/* Left Column - Evidence */}
                        <div className="flex-1 overflow-y-auto pr-4">
                          <Card className="bg-[#0A0B0F] border-gray-700">
                            <CardHeader>
                              <CardTitle className="text-white flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-yellow-400" />
                                Evidence
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {renderEvidenceColumn(selectedItem)}
                            </CardContent>
                          </Card>
                        </div>
                        
                        {/* Right Column - Report Card */}
                        <div className="flex-1 overflow-y-auto pl-4">
                          <Card className="bg-[#0A0B0F] border-gray-700">
                            <CardHeader>
                              <CardTitle className="text-white flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                                Report Details
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                              {/* Report Information */}
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm text-gray-400">Reported User</label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[#FF7A00] font-medium">{selectedItem.reportedUser}</span>
                                    <Button size="sm" variant="ghost" className="h-6 px-2 text-blue-400">
                                      <ExternalLink className="w-3 h-3 mr-1" />
                                      View Profile
                                    </Button>
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="text-sm text-gray-400">Reporter(s)</label>
                                  <p className="text-white mt-1">{selectedItem.reportedBy}</p>
                                </div>
                                
                                <div>
                                  <label className="text-sm text-gray-400">Reason for Report</label>
                                  <p className="text-white mt-1">{selectedItem.reason}</p>
                                </div>
                                
                                <div>
                                  <label className="text-sm text-gray-400">Additional Details</label>
                                  <div className="mt-1 p-3 bg-gray-800/50 border border-gray-700/50 rounded">
                                    <p className="text-gray-300 text-sm">{selectedItem.details}</p>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm text-gray-400">Priority</label>
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getPriorityColor(selectedItem.priority)}`}>
                                      {selectedItem.priority}
                                    </span>
                                  </div>
                                  <div>
                                    <label className="text-sm text-gray-400">Date Reported</label>
                                    <p className="text-white mt-1 text-sm">{selectedItem.date}</p>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Moderation Actions */}
                              <div className="space-y-4 pt-4 border-t border-gray-700/50">
                                <h4 className="text-white font-semibold">Moderation Actions</h4>
                                
                                <div className="space-y-2">
                                  <Button 
                                    className="w-full justify-start bg-green-600/10 border border-green-600/30 text-green-400 hover:bg-green-600/20"
                                    onClick={() => handleModerationAction('dismiss', selectedItem)}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Dismiss Report
                                  </Button>
                                  
                                  <Button 
                                    className="w-full justify-start bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20"
                                    onClick={() => handleModerationAction('delete', selectedItem)}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Delete Content
                                  </Button>
                                  
                                  <Button 
                                    className="w-full justify-start bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                                    onClick={() => handleModerationAction('warn', selectedItem)}
                                  >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    Warn User
                                  </Button>
                                  
                                  <Button 
                                    className="w-full justify-start bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                                    onClick={() => handleModerationAction('ban24h', selectedItem)}
                                  >
                                    <UserMinus className="w-4 h-4 mr-2" />
                                    Ban User (24h)
                                  </Button>
                                  
                                  <Button 
                                    className="w-full justify-start bg-red-600/20 border border-red-600/50 text-red-300 hover:bg-red-600/30"
                                    onClick={() => handleModerationAction('banPerm', selectedItem)}
                                  >
                                    <Ban className="w-4 h-4 mr-2" />
                                    Ban User (Permanent)
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
