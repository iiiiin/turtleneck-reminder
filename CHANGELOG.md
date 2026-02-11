# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [Unreleased]

## [1.1.0] - 2026-02-11
### Added
- 일본어(ja) 로케일 추가
- 스토어/법무/README 이미지 문서를 `docs/` 구조로 정리 (`docs/store`, `docs/legal`, `docs/images`)
- 릴리즈 자동화 개선: `CHANGELOG.md`의 `Unreleased`를 버전 섹션으로 승격하는 워크플로우 추가 (`scripts/release.py`)

### Changed
- 알림 로직을 2단계(`good`, `danger`)로 단순화하고 설정을 단일 `danger` 시간 기준으로 변경
- 팝업 UI를 단일 알림 시간 입력 구조로 변경
- README 및 스토어 등록 문서를 현재 기능(2단계 상태/단일 알림 시간/다국어)에 맞게 업데이트

### Removed
- `warning` 단계 관련 코드/문구/로케일 키 제거
- 루트의 문서용 이미지 파일(`image.png`, `image-1.png`, `image-2.png`) 제거 후 `docs/images/`로 이동
- `release-notes/` 디렉터리 제거(중복 릴리즈 노트 관리 종료)

## [1.0.1] - 2026-01-27
### Added
- 새로운 알리미 캐릭터 '기린' 추가
- 알리미 캐릭터 선택 UI(셀렉트 박스) 추가
- 영어(EN) 로케일 지원 추가

### Changed
- 프로젝트 다국어 사용성 개선
- 웹스토어 배포를 위한 manifest 버전 업데이트 (1.0.0 → 1.0.1)

### Notes
- Git 태그는 `v1.0.1` 권장

## [1.0.0] - 2026-01-23
### Added
- 프로젝트 초기 공개 버전
