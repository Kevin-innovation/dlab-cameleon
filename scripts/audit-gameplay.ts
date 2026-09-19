import { auditMaps } from "../src/lib/gameplay-audit";
import { droppedExtraCover, MAPS } from "../src/lib/maps";
import { beginRound, emptyRoom, sanitizeRoom } from "../src/lib/round";

const report = auditMaps(MAPS);

for (const map of report.maps) {
  const { metrics } = map;
  console.log(
    `${map.mapId}: ${metrics.width}x${metrics.depth}, boxes=${metrics.boxCount}, props=${metrics.propCount}, ` +
      `primaryCover=${metrics.primaryCoverCount}, spawns=${metrics.spawnCount}/${metrics.hunterSpawnCount}, ` +
      `sight=${Math.round(metrics.sightCoverage * 100)}%, rooms=${metrics.roomCount}`,
  );
  for (const problem of map.issues) {
    console.log(`  ${problem.severity.toUpperCase()} ${problem.code}: ${problem.message}`);
  }
  for (const dropped of droppedExtraCover[map.mapId] ?? []) {
    console.log(`  DROPPED extra cover ${dropped}`);
  }
}

const errors = report.issues.filter((problem) => problem.severity === "error");
const boundedRoom = sanitizeRoom({
  ...emptyRoom(),
  prepareTime: -1,
  hideTime: 999,
  huntTime: 9999,
  hunterCount: 99,
  ammoCount: 0,
});
const singlePlayerRound = beginRound(emptyRoom(), ["only-player"], Date.now());
if (
  boundedRoom.prepareTime !== 3 ||
  boundedRoom.hideTime !== 180 ||
  boundedRoom.huntTime !== 300 ||
  boundedRoom.hunterCount !== 3 ||
  boundedRoom.ammoCount !== 3 ||
  singlePlayerRound.phase !== "lobby"
) {
  errors.push({ severity: "error", code: "ROUND_CONTRACT_FAILED", message: "방 설정 정규화 또는 1인 라운드 차단 계약이 깨졌습니다." });
}
if (errors.length > 0) {
  process.exitCode = 1;
  console.error(`게임성 감사 실패: ${errors.length}개 오류`);
} else {
  console.log(`게임성 감사 통과: 오류 0개, 경고 ${report.issues.length}개`);
}
