import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { UploadPanel } from './components/UploadPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Footer } from './components/Footer';
import { ApiKeyModal } from './components/modals/ApiKeyModal';
import { CompletionModal } from './components/modals/CompletionModal';
import { LoginModal } from './components/modals/LoginModal';
import { Toast } from './components/Toast';
import { StagedFile, GeneratedMetadata, Settings, ToastInfo, ControlSettings } from './types';
import { callApiWithBackoff, createPrompt } from './services/geminiService';
import { DEFAULT_SETTINGS, REQUEST_PER_MINUTE } from './constants';

// This is to make Supabase available in the window scope for the script tag
declare global {
  interface Window {
    supabase: any;
  }
}

// IMPORTANT: Replace with your actual Supabase project URL and anon key.
// It's recommended to use environment variables for these.
const supabaseUrl = 'https://rbmcogijpfjmbvdmunch.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibWNvZ2lqcGZqbWJ2ZG11bmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTU5NjM5OTUsImV4cCI6MjAzMTUzOTk5NX0.8b6G5Tg2zmVrZf32iDRk_ppq5N2Ke6Sj3a82DUAU5PI';
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);


const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedMetadata[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const generationStopRef = useRef(false);
  
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  
  const [progress, setProgress] = useState({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [completionStats, setCompletionStats] = useState({ success: 0, total: 0 });
  
  const [toast, setToast] = useState<ToastInfo | null>(null);
  
  const [authUser, setAuthUser] = useState<any | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  
  // Effect for initializing and loading data from localStorage
  useEffect(() => {
    // Load API Keys
    try {
      const storedKeys = localStorage.getItem('geminiApiKeys');
      if (storedKeys) setApiKeys(JSON.parse(storedKeys));
    } catch (e) { console.error("Failed to parse API keys from localStorage", e); }
    
    // Load Model
    const storedModel = localStorage.getItem('geminiModel');
    if (storedModel) setSelectedModel(storedModel);
    
    // Load Settings
    try {
      const storedSettings = localStorage.getItem('appSettings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        setSettings(s => ({ ...s, ...parsedSettings }));
        setThemeColor(parsedSettings.themeColor || DEFAULT_SETTINGS.themeColor);
      } else {
        setThemeColor(DEFAULT_SETTINGS.themeColor);
      }
    } catch (e) { 
        console.error("Failed to parse settings from localStorage", e);
        setThemeColor(DEFAULT_SETTINGS.themeColor);
    }
    
    // Supabase auth listener
    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        setAuthUser(session?.user ?? null);
    });

    return () => {
        subscription?.unsubscribe();
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async () => {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });
        if (error) throw error;
    } catch (error: any) {
        showToast(`Google Sign-In Error: ${error.message}`, 'error');
    }
  };

  const handleSignOut = async () => {
      await supabase.auth.signOut();
      setAuthUser(null);
      showToast('You have been signed out.', 'info');
  };
  
  const setThemeColor = (color: string) => {
    document.documentElement.style.setProperty('--theme-color', color);
    const hoverColor = lightenDarkenColor(color, 20);
    document.documentElement.style.setProperty('--theme-color-hover', hoverColor);
    document.documentElement.style.setProperty('--theme-color-active-bg', color + '1a');
    document.documentElement.style.setProperty('--theme-color-shadow', color + '33');
    setSettings(s => ({...s, themeColor: color}));
  };

  const lightenDarkenColor = (col: string, amt: number) => {
    let usePound = false;
    if (col[0] === "#") {
        col = col.slice(1);
        usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  const handleControlSettingsChange = (newControlSettings: ControlSettings) => {
    setSettings(s => ({...s, controls: newControlSettings}));
  }

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings));
      showToast('Settings saved successfully!', 'success');
    } catch(e) {
      console.error("Error saving settings:", e);
      showToast('Could not save settings.', 'error');
    }
  };

  const clearAll = () => {
    // This function clears staged files and generated results,
    // but preserves all user settings in the Generation Controls panel.
    generationStopRef.current = true;
    setIsGenerating(false);
    setStagedFiles([]);
    setGeneratedMetadata([]);
    setProgress({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
    setIsPaused(false);
    showToast('All files and results have been cleared.', 'info');
  };

  const startGeneration = async () => {
    if (!apiKeys[0]) {
      showToast('API Key Missing. Please add an API key in the settings.', 'error');
      return;
    }
    const filesToProcess = stagedFiles.filter(f => f.status === 'ready');
    if (filesToProcess.length === 0) {
      showToast(stagedFiles.length > 0 ? 'Files are not ready for processing.' : 'No files uploaded to generate.', 'info');
      return;
    }

    generationStopRef.current = false;
    setIsGenerating(true);
    setIsPaused(false);
    
    const totalToProcess = filesToProcess.length;
    let processedCount = 0;
    let successCount = 0;
    const generationMode = settings.controls.activeTab;

    let currentApiKeyIndex = 0;
    let requestCounts = new Array(apiKeys.length).fill(0);
    let minuteStart = Date.now();

    for (const fileState of filesToProcess) {
      if (generationStopRef.current) {
        showToast('Generation stopped.', 'info');
        setProgress(prev => ({...prev, status: 'Stopped.'}));
        setIsGenerating(false);
        return;
      }
      
      while (isPaused) {
        setIsGenerating(false);
        showToast('Generation paused.', 'info');
        await new Promise(resolve => {
          const interval = setInterval(() => {
            if (!isPaused || generationStopRef.current) {
              clearInterval(interval);
              resolve(null);
            }
          }, 100);
        });
        if (generationStopRef.current) return;
        setIsGenerating(true); // Resume
      }
      
      // Rate limit & Key Rotation Logic
      const now = Date.now();
      if (now - minuteStart > 60000) {
        minuteStart = now;
        requestCounts.fill(0);
        currentApiKeyIndex = 0;
      }

      while (requestCounts[currentApiKeyIndex] >= REQUEST_PER_MINUTE) {
          currentApiKeyIndex++;
          if (currentApiKeyIndex >= apiKeys.length) {
              const waitTime = Math.max(0, 60000 - (Date.now() - minuteStart)) + 1000;
              setProgress(prev => ({ ...prev, status: `All keys rate-limited. Waiting ${Math.ceil(waitTime / 1000)}s...` }));
              await new Promise(resolve => setTimeout(resolve, waitTime));
              
              minuteStart = Date.now();
              requestCounts.fill(0);
              currentApiKeyIndex = 0;
          }
      }
      
      setProgress({ 
        percent: (processedCount / totalToProcess) * 100, 
        status: `Generating ${processedCount + 1}/${totalToProcess} (Key ${currentApiKeyIndex + 1}) | ${successCount} successful`, 
        currentFile: processedCount + 1, 
        totalFiles: totalToProcess 
      });
      setStagedFiles(prev => prev.map(f => f.id === fileState.id ? { ...f, status: 'processing' } : f));
      
      try {
        const prompt = createPrompt(settings.controls, generationMode);
        
        const onRetryCallback = (retryDelay: number) => {
          setProgress(prev => ({
            ...prev,
            status: `Error. Retrying ${fileState.file.name} in ${Math.ceil(retryDelay / 1000)}s...`
          }));
        };
        
        const ai = new GoogleGenAI({ apiKey: apiKeys[currentApiKeyIndex] });
        requestCounts[currentApiKeyIndex]++;
        const metadata = await callApiWithBackoff(ai, selectedModel, prompt, fileState.apiData, settings.controls, generationMode, onRetryCallback);
        
        setGeneratedMetadata(prev => [...prev, {
          ...metadata,
          thumbnailUrl: fileState.thumbnailDataUrl,
          filename: fileState.file.name,
          mode: generationMode,
          apiData: fileState.apiData,
        }]);
        successCount++;
      } catch (error: any) {
        console.error(`Failed to generate metadata for ${fileState.file.name}:`, error);
        showToast(`Error for ${fileState.file.name}: ${error.message}`, 'error');
         setGeneratedMetadata(prev => [...prev, {
            title: 'Error',
            description: `Failed: ${error.message}`,
            keywords: [],
            category: 'Error',
            thumbnailUrl: fileState.thumbnailDataUrl,
            filename: fileState.file.name,
            mode: generationMode,
            apiData: fileState.apiData,
        }]);
      }

      processedCount++;
      setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
    }

    if (generationStopRef.current) return;

    setIsGenerating(false);
    setProgress({ 
        percent: 100, 
        status: `Complete. ${successCount} of ${totalToProcess} successful.`, 
        currentFile: totalToProcess, 
        totalFiles: totalToProcess 
    });
    setCompletionStats({ success: successCount, total: processedCount });
    setIsCompletionModalOpen(true);
  };
  
  const handleRegenerate = async (index: number) => {
    if (!apiKeys[0]) {
      showToast('API Key Missing.', 'error');
      return;
    }
    const metadataEntry = generatedMetadata[index];
    if (!metadataEntry || !metadataEntry.apiData) {
      showToast('Cannot regenerate. Missing data.', 'error');
      return;
    }

    const ai = new GoogleGenAI({ apiKey: apiKeys[0] });
    const generationMode = settings.controls.activeTab;

    try {
      const prompt = createPrompt(settings.controls, generationMode);
      
      const onRetryCallback = (retryDelay: number) => {
        console.log(`Regeneration for ${metadataEntry.filename} failed. Retrying in ${retryDelay}ms...`);
        showToast(`Regeneration failed, retrying...`, 'warning');
      };

      const newMetadata = await callApiWithBackoff(ai, selectedModel, prompt, metadataEntry.apiData, settings.controls, generationMode, onRetryCallback);

      setGeneratedMetadata(prev => prev.map((item, i) => i === index ? { ...item, ...newMetadata, mode: generationMode } : item));
      showToast(`${metadataEntry.filename} regenerated.`, 'success');
    } catch (error: any) {
      console.error(`Failed to regenerate metadata for ${metadataEntry.filename}:`, error);
      showToast(`Regeneration failed: ${error.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-gray-200">
      <Header 
        authUser={authUser}
        onSignIn={() => setIsLoginModalOpen(true)}
        onSignOut={handleSignOut}
      />
      <main className="flex-grow container mx-auto px-4 lg:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-1">
            <ControlPanel 
              settings={settings.controls}
              onSettingsChange={handleControlSettingsChange}
              onSave={handleSaveSettings}
              onApiKeyClick={() => setIsApiKeyModalOpen(true)}
              themeColor={settings.themeColor}
              onThemeColorChange={setThemeColor}
              fileExtension={settings.fileExtension}
              onFileExtensionChange={(ext) => setSettings(s => ({...s, fileExtension: ext}))}
            />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <UploadPanel 
              stagedFiles={stagedFiles}
              setStagedFiles={setStagedFiles}
              progress={progress}
              isGenerating={isGenerating}
              isPaused={isPaused}
              setIsPaused={setIsPaused}
              startGeneration={startGeneration}
              generatedMetadata={generatedMetadata}
              setProgress={setProgress}
              showToast={showToast}
              selectedStockSite={settings.selectedStockSite}
              onStockSiteChange={(site) => setSettings(s => ({...s, selectedStockSite: site}))}
              fileExtension={settings.fileExtension}
              isLoggedIn={!!authUser}
              clearAll={clearAll}
            />
            <ResultsPanel 
              metadata={generatedMetadata}
              setMetadata={setGeneratedMetadata}
              onRegenerate={handleRegenerate}
            />
          </div>
        </div>
      </main>
      <Footer />
      
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        showToast={showToast}
        themeColor={settings.themeColor}
      />

      <CompletionModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        stats={completionStats}
        generatedMetadata={generatedMetadata}
        selectedStockSite={settings.selectedStockSite}
        fileExtension={settings.fileExtension}
      />
      
      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSignIn={() => {
            setIsLoginModalOpen(false);
            handleSignIn();
        }}
      />

      {toast && (
        <Toast 
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;