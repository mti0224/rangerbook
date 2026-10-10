# Rangerbook Game-Tech redesign — review notes

## Scope
This PR applies a shared presentation layer to **all 39 regular HTML pages** through the existing \`assets/js/site.js\` entrypoint. \`404.html\` remains unchanged on purpose: it also hosts legacy deep-link fallback content for stage pages, so its routing must not be altered casually.

### Shared experience
- Game-Tech colors, spacing, page headings, menus, cards, filters, tables, PvP and guild panels, chart containers, stage information, modals and the administrator dashboard.
- Desktop: fixed left navigation **cloned from the existing public navbar**, with the original top controls.
- Mobile: existing hamburger menu and settings menu; no new navigation implementation.
- **Theme:** the original \`rangerbook-theme\` localStorage key and \`data-theme\` values remain owned by \`site.js\`. Both dark/light are supported.
- **Homepage:** original left-image/right-text cards, original \`assets/main_icon\` images and tool links preserved. Added small decorative thumbnails of existing characters using existing files from \`rangerbook_res\`.
- **Ranger and gear detail:** original modals, JS handlers and detail deep-link routes remain unchanged; only presentation of the existing "查看詳細資訊" links changes.
- Reuse existing game assets. No model-generated substitute art or replacement JSON.
- Responsive shell uses breakpoints 1120, 760 and 620px. Respect \`prefers-reduced-motion\`.

## Authentication / access control
No changes to \`admin-auth.js\`, backend permissions, role names, API endpoints or resource collectors. Public sidebar links are **cloned** from the original public navigation, and do not include restricted routes. Existing \`[hidden]\` handling is preserved.
Roles remain user / admin / super_admin, and the existing protected sections are not made public. Check backend authorization independently in the deployment approval stage; hiding controls is not a security boundary.

## Explicitly unchanged
- Character, equipment, skill and stage data / rangerbook_res repository.
- Ranger animations, awakening, talent, modal handlers, compare logic.
- PvP/guild rankings, usage statistics, historical chart math, filtering code.
- Time-based update jobs, EC2, API, credentials or login flows.
- No automatic deployment, merge or changes to \`main\`.

## Manual browser acceptance checklist (mandatory before merge)
1. Test 1366px and 1920px desktop: sidebar, all 11 public nav links and top settings.
2. Test 390px mobile: hamburger open/close, settings, no sidebar and no horizontal overflow.
3. Switch dark/light on multiple nested pages; refresh and confirm the original choice persisted.
4. Confirm image-left homepage cards and all original hrefs.
5. Ranger list search, star/type/element and advanced filters; open/close modal, direct detail deep link, level/skill/talent/animation.
6. Gear filtering (AND/OR, SPEC+, levels) and modal-to-detail navigation; abilities.
7. Ranger comparison, stat charts, ranking pagination and modal.
8. PvP leaderboard, usage and history, character detail / equipment combination.
9. Guild ranking member detail and admin-only guild usage visibility.
10. Hard/extreme stages, endless tower, event/advent enemies, labyrinth stages and artifacts.
11. Admin logout/login, 401/403 handling, admin resource monitor, super_admin-only user controls and player search.
12. Visit old stage deep-link routes and 404 fallbacks.
13. Verify accessibility focus contrast and reduced-motion.
14. Ensure hosting/network CSP permits already-used remote Rangerbook official source thumbnails.

Automated code-level preflight confirms only the stylesheet, presentation shell, homepage decoration and documentation are changed; all other page logic and auth modules are untouched.
