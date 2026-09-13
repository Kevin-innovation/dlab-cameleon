import { auditMaps } from "../src/lib/gameplay-audit";
import { MAPS } from "../src/lib/maps";

const report = auditMaps(MAPS);

for (const map of report.maps) {
  const { metrics } = map;
  console.log(
    `${map.mapId}: ${metrics.width}x${metrics.depth}, boxes=${metrics.boxCount}, props=${metrics.propCount}, ` +
      `primaryCover=${metrics.primaryCoverCount}, spawns=${metrics.spawnCount}/${metrics.hunterSpawnCount}`,
  );
  for (const problem of map.issues) {
    console.log(`  ${problem.severity.toUpperCase()} ${problem.code}: ${problem.message}`);
  }
}

const errors = report.issues.filter((problem) => problem.severity === "error");
if (errors.length > 0) {
  process.exitCode = 1;
  console.error(`게임성 감사 실패: ${errors.length}개 오류`);
} else {
  console.log(`게임성 감사 통과: 오류 0개, 경고 ${report.issues.length}개`);
}
