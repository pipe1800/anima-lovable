export * as Profile from './profile/queries';
export * as Characters from './characters/queries';
export * as CharacterMutations from './characters/mutations';
export * as CharacterUser from './characters/userCharacters';
export * as CharacterRecommendations from './characters/recommendations';
export * as CharacterInteractions from './characters/interactions';
export * as CharacterUserSettings from './characters/userCharacterSettings';
export * as CharacterProfileView from './characters/profileView';
export * as CharacterFunctions from './characters/functions';
export * as Billing from './billing/queries';
export * as WorldInfo from './worldInfo/queries';
export * as WorldInfoMutations from './worldInfo/mutations';
export * as WorldInfoInteractions from './worldInfo/interactions';
export * as WorldInfoImportExport from './worldInfo/importExport';
export * as WorldInfoSelection from './worldInfo/selection';
export * as Personas from './personas/queries';
export * as Chats from './chats/queries';
export * as ChatFunctions from './chats/functions';
export * as ChatContextMaintenance from './chats/contextMaintenance';
export * as Auth from './auth/queries';
export * as Uploads from './uploads/storage';
export * from './shared/searchTypes';
export * as Tags from './tags/queries';
export * as PersonaMutations from './personas/mutations';
export * as Payments from './billing/paypalClient'; // alias (replaces deprecated ./payments)
export * as PayPalClient from './billing/paypalClient';
export * as RelationshipTemplate from './relationships/template';
export * as RelationshipProgress from './relationships/progress';
export * as DebugDiagnostics from './debug/contextDiagnostics';

// Flattened re-exports removed (2025-08-21 cleanup).
