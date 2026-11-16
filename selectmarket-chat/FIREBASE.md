# 셀렉트마켓 채팅 · Firebase로 배포하기

내 컴퓨터에서만 돌던 챗봇을 인터넷 주소로 열어요. **무료(Spark) 요금제로 가능한 범위**로 만들었어요.

```
GitHub(소스) ─▶ 내 컴퓨터에서 npm run deploy ─▶ Firebase Hosting(화면) 
                                               └ Firestore(대화 기록·지침·스토어 표)
```

## 무엇이 달라지나
| 항목 | 로컬 | Firebase 배포 |
|---|---|---|
| 대화 기록 | 브라우저 로컬 스토리지(새로고침·프로필이 바뀌면 사라짐) | Firestore `chatlogs` (손님은 자기 대화만 저장·신고) |
| 운영자 지침 | `data/guidelines.json` | Firestore `config/guidelines` |
| 스토어 표(상품·재고·주문·배송) | 브라우저 | Firestore `store` |
| 관리자 | 누구나 버튼 | 구글 로그인 + 관리자 명단(`admins`)에 있는 이메일만 |
| 즉시 조회 답변 | 동작 | 동작 |
| **AI 답변** | 서버가 키로 호출 | **동작 안 함** — 무료 요금제에는 서버(Functions)가 없어서 키를 안전하게 둘 곳이 없어요 |

AI 답변까지 배포하려면 Blaze 요금제 + Cloud Functions + 비밀값(Secret Manager)에 키를 보관해야 해요. 지금 구성에는 넣지 않았어요.

## 순서
1. **Firebase 프로젝트 만들기** (콘솔 → 프로젝트 추가 → Google 애널리틱스는 꺼도 돼요)
2. **웹 앱 등록**: 프로젝트 설정 → 내 앱 → 웹(`</>`). 나온 설정값을 `firebase-config.example.js`를 복사한 `firebase-config.js`에 붙여 넣기. (이 파일은 깃에 올라가지 않아요)
3. **Firestore 만들기**: 빌드 → Firestore Database → 만들기 (프로덕션 모드)
4. **로그인 켜기**: 빌드 → Authentication → 시작하기 → 로그인 방법에서 **익명**과 **Google**을 사용 설정
5. **관리자 등록**: Firestore에서 컬렉션 `admins`를 만들고, 문서 ID를 **내 구글 이메일**로 해서 필드 하나(예: `role` = `owner`)를 넣어요.
6. 터미널에서:
```bash
cd selectmarket-chat
npx firebase-tools login
npx firebase-tools use --add
npm run deploy
```
7. 끝나면 `https://프로젝트ID.web.app` 주소가 나와요. 탭 4 → "관리자 로그인"으로 들어가 확인해요.

## 지켜야 할 것
- 보안 규칙(`firestore.rules`)이 "누가 읽고 쓰는지"를 정해요. 배포할 때 같이 올라가요.
- 손님 누구나 대화를 남길 수 있어서, 대화에 이름·연락처를 쓰지 않도록 화면 안내를 유지해요.
- 이 주소는 실습용이에요. 실제 고객 개인정보는 넣지 마세요.
