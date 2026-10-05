// Native destroy POST HTTP 200 and independent profile false; restored profile true.
// Captured 2026-10-05. No account identifiers or credentials are bundled.
export const verifiedDestroy = Object.freeze({
  endpoint: 'friendships/destroy', method: 'POST',
  defaults: Object.freeze(Object.fromEntries([
    'include_profile_interstitial_type','include_blocking','include_blocked_by',
    'include_followed_by','include_want_retweets','include_mute_edge','include_can_dm',
    'include_can_media_tag','include_ext_is_blue_verified','include_ext_verified_type',
    'include_ext_profile_image_shape','skip_status'
  ].map(key=>[key,'1']))),
  evidence: Object.freeze({method:'POST',parameter:'user_id',verifiedAt:Date.parse('2026-10-05T00:00:00+08:00'),source:'native-post-and-profile-confirmation'})
});
