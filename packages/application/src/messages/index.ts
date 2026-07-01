// CQRS command + query payload shapes, split per subdomain (architecture audit
// P3-2) to match the per-subdomain handler organization. Re-exported as one
// barrel so call sites keep importing from `@pickupvb/application` /
// `../messages/index.js` unchanged. Bracket / standalone-bracket / league /
// scoring commands live in their own handler files, not here.
export * from './event.js';
export * from './team.js';
export * from './community-listing.js';
export * from './media-post.js';
export * from './user-profile.js';
export * from './group.js';
export * from './poll.js';
export * from './messaging.js';
export * from './account-deletion.js';
