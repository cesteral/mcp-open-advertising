# `open-agentic-advertising-dev` Secret Collection Sheet

Use this sheet to gather the values required by `./scripts/create-secrets.sh dev`.

Important:

- For `*_SERVICE_ACCOUNT_JSON` secrets, store base64-encoded JSON, not raw JSON.
- Leave optional refresh/debug fields blank if you do not plan to use them yet.
- Do not commit this sheet with real values filled in.

## Shared

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-jwt-secret-key` | Yes | Generated locally | Use `openssl rand -base64 32` |

## DBM / Google / CM360

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-dbm-service-account-json` | Yes | Google Cloud service account JSON | Base64-encode the full JSON |
| `cesteral-dv360-service-account-json` | Yes | Google Cloud service account JSON | Base64-encode the full JSON |
| `cesteral-cm360-service-account-json` | Yes | Google Cloud service account JSON | Base64-encode the full JSON |
| `cesteral-gads-developer-token` | Yes | Google Ads | |
| `cesteral-gads-client-id` | Yes | Google OAuth app | |
| `cesteral-gads-client-secret` | Yes | Google OAuth app | |
| `cesteral-gads-refresh-token` | Yes | Google OAuth flow | |
| `cesteral-gads-login-customer-id` | Optional | Google Ads manager account | No dashes |
| `cesteral-sa360-client-id` | Yes | Google OAuth app | |
| `cesteral-sa360-client-secret` | Yes | Google OAuth app | |
| `cesteral-sa360-refresh-token` | Yes | Google OAuth flow | |
| `cesteral-sa360-login-customer-id` | Optional | SA360 manager account | |

## The Trade Desk

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-ttd-partner-id` | Yes | TTD partner account | |
| `cesteral-ttd-api-secret` | Yes | TTD API credentials | |

## Meta

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-meta-access-token` | Yes | Meta app/user token | |
| `cesteral-meta-app-id` | Optional | Meta app settings | Useful for token introspection |
| `cesteral-meta-app-secret` | Optional | Meta app settings | Useful for token introspection |

## LinkedIn

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-linkedin-access-token` | Yes | LinkedIn OAuth token | |
| `cesteral-linkedin-client-id` | Optional | LinkedIn app settings | For refresh-token flow |
| `cesteral-linkedin-client-secret` | Optional | LinkedIn app settings | For refresh-token flow |
| `cesteral-linkedin-refresh-token` | Optional | LinkedIn OAuth flow | For refresh-token flow |

## TikTok

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-tiktok-access-token` | Yes | TikTok OAuth token | |
| `cesteral-tiktok-advertiser-id` | Yes | TikTok Ads account | |
| `cesteral-tiktok-app-id` | Optional | TikTok app settings | For refresh-token flow |
| `cesteral-tiktok-app-secret` | Optional | TikTok app settings | For refresh-token flow |
| `cesteral-tiktok-refresh-token` | Optional | TikTok OAuth flow | For refresh-token flow |

## Pinterest

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-pinterest-access-token` | Yes | Pinterest OAuth token | |
| `cesteral-pinterest-ad-account-id` | Yes | Pinterest Ads account | |
| `cesteral-pinterest-app-id` | Optional | Pinterest app settings | For refresh-token flow |
| `cesteral-pinterest-app-secret` | Optional | Pinterest app settings | For refresh-token flow |
| `cesteral-pinterest-refresh-token` | Optional | Pinterest OAuth flow | For refresh-token flow |

## Snapchat

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-snapchat-access-token` | Yes | Snapchat OAuth token | |
| `cesteral-snapchat-ad-account-id` | Yes | Snapchat Ads account | |
| `cesteral-snapchat-org-id` | Optional | Snapchat organization | Helpful for some auth flows |
| `cesteral-snapchat-app-id` | Optional | Snapchat app settings | For refresh-token flow |
| `cesteral-snapchat-app-secret` | Optional | Snapchat app settings | For refresh-token flow |
| `cesteral-snapchat-refresh-token` | Optional | Snapchat OAuth flow | For refresh-token flow |

## Amazon DSP

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-amazon-dsp-access-token` | Yes | Amazon OAuth token | |
| `cesteral-amazon-dsp-profile-id` | Yes | Amazon DSP profile | |
| `cesteral-amazon-dsp-client-id` | Yes | Amazon app/client config | Used by runtime |
| `cesteral-amazon-dsp-app-id` | Optional | Amazon app settings | For refresh-token flow |
| `cesteral-amazon-dsp-app-secret` | Optional | Amazon app settings | For refresh-token flow |
| `cesteral-amazon-dsp-refresh-token` | Optional | Amazon OAuth flow | For refresh-token flow |

## Microsoft Ads

| Secret Manager name | Required | Value source | Notes |
|---|---|---|---|
| `cesteral-msads-access-token` | Yes | Microsoft OAuth token | |
| `cesteral-msads-developer-token` | Yes | Microsoft Ads developer account | |
| `cesteral-msads-customer-id` | Yes | Microsoft Ads customer | |
| `cesteral-msads-account-id` | Yes | Microsoft Ads account | |

## Base64 Helper

For Google service account JSON secrets:

```bash
base64 -i service-account.json | pbcopy
```

On Linux:

```bash
base64 -w 0 service-account.json
```
