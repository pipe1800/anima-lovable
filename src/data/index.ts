export * as Profile from './profile/queries';
export * as Characters from './characters/queries';
export * as CharacterDetails from './characters/details';
export * as CharacterMutations from './characters/mutations';
export * as CharacterUser from './characters/userCharacters';
export * as CharacterRecommendations from './characters/recommendations';
export * as CharacterInteractions from './characters/interactions';
export * as CharacterUserSettings from './characters/userCharacterSettings';
export * as CharacterProfileView from './characters/profileView';
export * as Billing from './billing/queries';
export * as WorldInfo from './worldInfo/queries';
export * as WorldInfoMutations from './worldInfo/mutations';
export * as WorldInfoInteractions from './worldInfo/interactions';
export * as WorldInfoImportExport from './worldInfo/importExport';
export * as WorldInfoSelection from './worldInfo/selection';
export * as Personas from './personas/queries';
export * as Chats from './chats/queries';
export * as ChatFunctions from './chats/functions';
export * as ProfileStats from './profile/stats';
export * as Auth from './auth/queries';
export * as Uploads from './uploads/storage';
export * from './shared/searchTypes';
export * as Tags from './tags/queries';
export * as PersonaMutations from './personas/mutations';
export * as Payments from './payments/client'; // compatibility layer
export * as PayPalClient from './billing/paypalClient'; // New export for PayPal client
// Legacy Payments compatibility already points to payments/client -> now index.ts in payments re-exports billing/paypalClient

// Removed deprecated exports: WorldInfoPublic, WorldInfoExtendedDeprecated, WorldInfoTagsDeprecated, CharacterExtended, PaymentsDeprecated

// Flattened re-exports (to be pruned later)
export * from './profile/queries';
export * from './characters/queries';
export * from './characters/details';
export * from './characters/mutations';
export * from './characters/userCharacters';
export * from './characters/recommendations';
export * from './characters/userCharacterSettings';
export * from './billing/queries';
export * from './worldInfo/mutations';
export * from './worldInfo/interactions';
export * from './worldInfo/importExport';
export * from './personas/queries';
export * from './profile/stats';
export * from './auth/queries';
export * from './chats/functions';
export * from './characters/profileView';
