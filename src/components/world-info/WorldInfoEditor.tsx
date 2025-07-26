import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  BookOpen, 
  Settings,
  Share,
  Download,
  Upload,
  Loader2
} from 'lucide-react';
import WorldInfoBasicForm from '@/components/world-info/WorldInfoBasicForm';
import WorldInfoEntries from '@/components/world-info/WorldInfoEntries';
import { useWorldInfo } from '@/hooks/useWorldInfo';
import { useWorldInfoQueries } from '@/queries/worldInfoQueries';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface WorldInfoEditorProps {
  mode: 'create' | 'edit';
}

export default function WorldInfoEditor({ mode }: WorldInfoEditorProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('basics');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const {
    formData,
    isLoading,
    isSaving,
    isDirty,
    loadWorldInfo,
    updateFormData,
    handleSubmit,
    handleDelete,
    addEntry,
    updateEntry,
    deleteEntry,
    errors
  } = useWorldInfo();

  const { data: worldInfo, isLoading: isLoadingWorldInfo } = useWorldInfoQueries.useWorldInfo(
    id || '',
    { enabled: mode === 'edit' && !!id }
  );

  const { data: entries = [], isLoading: isLoadingEntries } = useWorldInfoQueries.useWorldInfoEntries(
    id || '',
    { enabled: mode === 'edit' && !!id }
  );

  // Load world info for editing
  useEffect(() => {
    if (mode === 'edit' && worldInfo) {
      loadWorldInfo(worldInfo);
    }
  }, [mode, worldInfo, loadWorldInfo]);

  // Navigate back
  const handleBack = () => {
    if (isDirty) {
      const confirmLeave = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      if (!confirmLeave) return;
    }
    navigate('/world-info');
  };

  // Save world info
  const handleSave = async () => {
    const result = await handleSubmit(mode === 'create' ? 'create' : 'update');
    if (result?.success && mode === 'create' && result.data) {
      // Redirect to edit mode after creation
      navigate(`/world-info/${result.data.id}/edit`, { replace: true });
    }
  };

  // Delete world info
  const handleDeleteConfirm = async () => {
    if (mode === 'edit' && id) {
      const success = await handleDelete(id);
      if (success) {
        navigate('/world-info');
      }
    }
    setShowDeleteDialog(false);
  };

  // Export world info
  const handleExport = () => {
    if (!worldInfo) return;

    const exportData = {
      name: worldInfo.name,
      description: worldInfo.description,
      tags: worldInfo.tags,
      entries: entries.map(entry => ({
        keywords: entry.keywords,
        text: entry.entry_text
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldInfo.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import world info
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        
        // Update form data with imported data
        updateFormData({
          name: importData.name || '',
          description: importData.description || '',
          tags: importData.tags || []
        });

        setShowImportDialog(false);
      } catch (error) {
        console.error('Failed to import world info:', error);
      }
    };
    reader.readAsText(file);
  };

  const isDataLoading = (mode === 'edit' && (isLoadingWorldInfo || isLoadingEntries)) || isLoading;
  const canAddEntries = mode === 'edit' && !!id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F0F23] via-[#1a1a2e] to-[#16213e] p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-gray-400 hover:text-white p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {mode === 'create' ? 'Create World Info' : 'Edit World Info'}
              </h1>
              {mode === 'edit' && worldInfo && (
                <p className="text-gray-400 text-sm mt-1">{worldInfo.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'edit' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={!worldInfo}
                  className="hidden sm:flex"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportDialog(true)}
                  className="hidden sm:flex"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isSaving}
                  className="hidden sm:flex"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </>
            )}
            <Button
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              size="sm"
              className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isDataLoading ? (
          <Card className="bg-[#1a1a2e] border-gray-700/50">
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF7A00]" />
                <span className="ml-3 text-white">Loading...</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Main Content */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 border border-gray-700">
              <TabsTrigger 
                value="basics" 
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
              >
                <Settings className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Basic Info</span>
                <span className="sm:hidden">Basics</span>
              </TabsTrigger>
              <TabsTrigger 
                value="entries"
                className="data-[state=active]:bg-[#FF7A00] data-[state=active]:text-white"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Lorebook</span>
                <span className="sm:hidden">Entries</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-6">
              <WorldInfoBasicForm
                formData={formData}
                onChange={updateFormData}
                errors={errors}
              />
            </TabsContent>

            <TabsContent value="entries" className="space-y-6">
              <WorldInfoEntries
                entries={entries}
                onAdd={addEntry}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
                canAddEntries={canAddEntries}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Mobile Action Bar */}
        {mode === 'edit' && (
          <div className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] border-t border-gray-700 p-4 sm:hidden">
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!worldInfo}
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="w-4 h-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isSaving}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete World Info</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete this world info? This will also delete all associated entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Import World Info</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Select a JSON file to import world info data. This will overwrite the current basic information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="sr-only"
                />
                Select File
              </label>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
