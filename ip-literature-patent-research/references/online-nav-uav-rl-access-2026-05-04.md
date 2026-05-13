# Online Navigation UAV/RL Paid Access Probe, 2026-05-04

This probe used a headed Chrome CDP session and clicked resource titles from the online resource-navigation page. Do not store the private navigation URL. Outputs are redacted and query-token stripped.

## Best Current Routes For UAV / Reinforcement Learning

Use these first for literature review:

| Use | Databases that opened directly |
|---|---|
| RL / AI / robotics / control | IEEE Xplore / IEL, ACM Digital Library, ScienceDirect, SpringerLink, Wiley, Taylor & Francis, Web of Science, Scopus, Inspec, SIAM, ProQuest CSA |
| UAV / aerospace / mechanical | SAE Mobilus, ASME, ASCE, ASTM Compass, AIAA, SPIE, IET, RTCA, military-standard services, special-document / technology-report services |
| Materials / sensors / energy / physics | IOPscience, ScienceDirect, Wiley, Taylor & Francis, SpringerLink, ACS, AIP, APS, RSC, Nature, Science Online |
| Chinese literature / reports / patents | CNKI, Wanfang official domain, Wanfang industry service, special documents / reports, IncoPat after IP-login route, Yi Patent after login route |

## Directly Usable Or Reachable

| Resource | Observed title-click target | Current status |
|---|---|---|
| IEEE Electronic Library / IEEE Xplore | IEEE Xplore home | Direct access/search surface visible |
| ACM Digital Library | ACM Digital Library | Direct access/search surface visible |
| ScienceDirect | ScienceDirect home | Direct access/search surface visible |
| SpringerLink | Springer Nature Link | Direct access/search surface visible |
| Wiley Online Library | Wiley browse/search surface | Direct access/search surface visible |
| Taylor & Francis | Taylor & Francis Online | Direct access/search surface visible |
| Web of Science | Web of Science smart search | Direct access/search surface visible |
| Scopus | Scopus homepage/search | Direct access/search surface visible |
| Inspec | Web of Science Inspec basic search | Direct access/search surface visible |
| SAE Mobilus | SAE Mobilus | Direct access/search surface visible |
| IOPscience | IOPscience | Direct access/search surface visible |
| ProQuest CSA | ProQuest Basic Search | Reachable/search surface visible |
| Annual Reviews | Annual Reviews | Reachable/search surface visible |
| CRC eBooks | Taylor & Francis eBooks | Reachable/search surface visible |
| Cambridge Core journals/books | Cambridge Core | Reachable/search surface visible |
| SAGE | SAGE journals mirror | Reachable/search surface visible |
| Emerald | Emerald Publishing | Reachable |
| IMechE current journals | SAGE journals mirror | Reachable/search surface visible |
| RTCA | RTCA site | Reachable; may need site-specific search/profile before treating as a licensed database |
| Foreign / national military standards | Shangwei military standard service | Reachable/search surface visible |
| Special documents / technology reports | Shangwei technology-report service | Reachable/search surface visible |
| Wanfang industry innovation service | Industry technology innovation platform | Reachable/search surface visible |
| Woodhead eBooks | ScienceDirect | Reachable/search surface visible |
| SIAM | SIAM journals | Reachable/search surface visible |

## Needs Manual Checkpoint Or Route Fix

| Resource | Current status | Next action |
|---|---|---|
| AIAA ARC | Security verification page | Manual checkpoint, then rerun with persistent profile. |
| ASME Digital Collection | Security verification page | Manual checkpoint, then rerun. |
| ASCE Library | Security verification page | Manual checkpoint, then rerun. |
| IET Digital Library | Security verification page | Manual checkpoint, then rerun. |
| ACS Publications | Security verification page | Manual checkpoint, then rerun. |
| AIP Publishing | Security verification page | Manual checkpoint, then rerun. |
| Science Online | Security verification page | Manual checkpoint, then rerun. |
| AHS helicopter journal | Security verification page | Manual checkpoint, then rerun. |
| EBSCO | Sign-in page | Needs institutional/sign-in checkpoint; query token is stripped in artifacts. |
| IncoPat | Public marketing page via title click | Use known login-menu IP-login route instead of raw title target. |
| Yi Patent | Login page | Needs manual or IP-login route investigation. |

## Not Directly Usable From Title Click In This Probe

| Resource | Observed failure |
|---|---|
| CQVIP | Navigation route error; use known manual IP-login path when site itself is reachable. |
| Engineering Village / Ei | Navigation title route landed on Scopus; direct official Engineering Village URL showed entitlement error. Treat as not confirmed. |
| Wanfang Data | Navigation route hit proxy reset in CDP; direct official Wanfang domain is IP-accessible. |
| AIAA Video Library | Connection reset; not the main AIAA ARC route. |
| SPIE Digital Library | Empty page after navigation. |
| RSC | Navigation error. |
| APS | Navigation error. |
| Nature | Navigation error. |
| IEL eBooks | Navigation error. |
| IHS ESDU | Stayed on navigation page. |
| Aviation engine knowledge base | Navigation error. |
| Aviation industry standard full-text database | Stayed on navigation page. |

## Artifact Roots

- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_rl_batch1\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_rl_batch1_rest_v3\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_aerospace_batch2\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_aerospace_aiaa_fix2\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_materials_batch3\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_uav_rl_generic_titles\`

## Update Rule

When rechecking a topic-specific batch:

1. Use `resource_nav_login_probe.py` for resources already in `site_registry.json`.
2. Use `generic_nav_title_probe.py` for arbitrary navigation titles not yet registered.
3. Promote stable, high-value resources into `site_registry.json` only after a direct search smoke succeeds.
4. Treat security-verification, sign-in, entitlement, and navigation-error pages as checkpoints, not failures to bypass.
