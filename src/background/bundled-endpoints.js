// Public X web query configuration captured from native HTTP 200 requests.
// No account IDs, cookies, authorization headers or pagination cursors.
const timelineFeatures = Object.fromEntries([
  ...[
    'rweb_cashtags_enabled','profile_label_improvements_pcf_label_in_post_enabled','responsive_web_profile_redirect_enabled',
    'creator_subscriptions_tweet_preview_api_enabled','responsive_web_graphql_timeline_navigation_enabled',
    'communities_web_enable_tweet_community_results_fetch','c9s_tweet_anatomy_moderator_badge_enabled',
    'responsive_web_grok_analyze_post_followups_enabled','rweb_cashtags_composer_attachment_enabled','responsive_web_jetfuel_frame',
    'rweb_sports_post_context_enabled','responsive_web_grok_share_attachment_enabled','responsive_web_grok_annotations_enabled',
    'articles_preview_enabled','responsive_web_edit_tweet_api_enabled','graphql_is_translatable_rweb_tweet_is_translatable_enabled',
    'view_counts_everywhere_api_enabled','longform_notetweets_consumption_enabled','responsive_web_twitter_article_tweet_consumption_enabled',
    'content_disclosure_indicator_enabled','content_disclosure_ai_generated_indicator_enabled','responsive_web_grok_show_grok_translated_post',
    'responsive_web_grok_analysis_button_from_backend','freedom_of_speech_not_reach_fetch_enabled','standardized_nudges_misinfo',
    'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled','longform_notetweets_rich_text_read_enabled',
    'responsive_web_nested_quote_preview_enabled','responsive_web_grok_image_annotation_enabled','responsive_web_grok_imagine_annotation_enabled',
    'responsive_web_grok_community_note_auto_translation_is_enabled'
  ].map(k=>[k,true]),
  ...[
    'rweb_video_screen_enabled','rweb_tipjar_consumption_enabled','verified_phone_label_enabled','premium_content_api_read_enabled',
    'responsive_web_grok_analyze_button_fetch_trends_enabled','rweb_conversational_replies_downvote_enabled','post_ctas_fetch_enabled',
    'longform_notetweets_inline_media_enabled','responsive_web_enhance_cards_enabled'
  ].map(k=>[k,false])
]);
const profileFeatures = Object.fromEntries([
  ...['hidden_profile_subscriptions_enabled','profile_label_improvements_pcf_label_in_post_enabled','responsive_web_profile_redirect_enabled',
    'subscriptions_verification_info_is_identity_verified_enabled','subscriptions_verification_info_verified_since_enabled',
    'highlights_tweets_tab_ui_enabled','responsive_web_twitter_article_notes_tab_enabled','creator_subscriptions_tweet_preview_api_enabled',
    'responsive_web_graphql_timeline_navigation_enabled'].map(k=>[k,true]),
  ...['rweb_tipjar_consumption_enabled','verified_phone_label_enabled','subscriptions_feature_can_gift_premium'].map(k=>[k,false])
]);
const listDefaults = {count:20,includePromotedContent:false,withGrokTranslatedBio:true};
const tweetToggles = {withPayments:false,withArticlePlainText:false};
const capturedAt = 1791049507215;
const record = (operation,queryId,defaults,features=timelineFeatures,fieldToggles={}) => ({
  operation,queryId,defaults,features,fieldToggles,source:'bundled-browser-verified',observedAt:capturedAt,
  lastHttpStatus:200,lastResponseAt:capturedAt,verifiedOn:'2026-10-04'
});
const records = [
  record('Following','uwmIAx89XrXNuGY-Y7WFLg',listDefaults),
  record('Followers','mrqxgX8JzwlL6pvYiC5CPA',listDefaults),
  record('BlueVerifiedFollowers','ck_SV_kTAlbD2WZiOFNbzw',listDefaults),
  record('UserByScreenName','KybxDj9RrADIITXlGG8kpw',{withGrokTranslatedBio:true},profileFeatures,{withPayments:false,withAuxiliaryUserLabels:true}),
  record('UserOriginalsTimeline','ty409m9cIpSEnLECl_SqMw',{count:20,includePromotedContent:true,withQuickPromoteEligibilityTweetFields:true,withVoice:true},timelineFeatures,tweetToggles),
  record('UserRepliesTimeline','9FLI4sKKO6rEojPOEHT7BA',{count:20,includePromotedContent:true,withCommunity:true,withVoice:true},timelineFeatures,tweetToggles),
  record('UserRepostsTimeline','hkQQA_PMJfzHlRtnUYYXMg',{count:20,includePromotedContent:true,withVoice:true},timelineFeatures,tweetToggles),
  record('accountOverviewDailyQuery','2hqAR3h2xhN1cUrUBZypyg',{show_realtime_active_followers:true,show_verified_followers:true},{})
];
export function bundledEndpoints() { const result=structuredClone(Object.fromEntries(records.map(r=>[r.operation,r])));
  Object.assign(result.UserOriginalsTimeline,{observedAt:1791342657000,lastResponseAt:1791342657000,verifiedOn:'2026-10-07'});return result; }
