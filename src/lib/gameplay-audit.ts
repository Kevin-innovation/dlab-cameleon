import { mapColliders } from "./maps";
import { circleHitsBox } from "./engine/collision";
import type { BoxDef, Collider, GameMap, RoomState } from "./types";

export type GameplayAuditIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type MapGameplayMetrics = {
  width: number;
  depth: number;
  boxCount: number;
  solidCount: number;
  propCount: number;
  primaryCoverCount: number;
  rotatedColliderCount: number;
  elevatedObjectCount: number;
  spawnCount: number;
  hunterSpawnCount: number;
};

export type MapGameplayAudit = {
  mapId: string;
  metrics: MapGameplayMetrics;
  issues: GameplayAuditIssue[];
};

export type GameplayAuditReport = {
  maps: MapGameplayAudit[];
  issues: GameplayAuditIssue[];
};

const PLAYER_SPAWN_RADIUS = 0.45;
const MIN_MAP_WIDTH = 30;
const MAX_MAP_WIDTH = 60;
const MIN_MAP_DEPTH = 24;
const MAX_MAP_DEPTH = 46;

function issue(severity: GameplayAuditIssue["severity"], code: string, message: string) {
  return { severity, code, message } satisfies GameplayAuditIssue;
}

function finiteBox(box: BoxDef) {
  return [box.x, box.y, box.z, box.w, box.h, box.d].every(Number.isFinite);
}

function containsPoint(
  box: Collider,
  x: number,
  z: number,
  radius: number,
) {
  const overlapsPlayerHeight = box.minY < 1.8 && box.maxY > 0;
  return overlapsPlayerHeight && circleHitsBox(x, z, radius, box);
}

function isPrimaryCover(box: BoxDef) {
  return Boolean(
    box.prop &&
      box.collide &&
      box.h >= 0.55 &&
      box.h <= 2.4 &&
      box.w >= 0.55 &&
      box.d >= 0.45 &&
      box.w <= 5.5 &&
      box.d <= 5.5,
  );
}

export function auditMap(map: GameMap): MapGameplayAudit {
  const issues: GameplayAuditIssue[] = [];
  const colliders = mapColliders(map);
  const propCount = map.boxes.filter((box) => Boolean(box.prop)).length;
  const primaryCoverCount = map.boxes.filter(isPrimaryCover).length;
  const rotatedColliderCount = map.boxes.filter((box) => Boolean(box.rotation) && Boolean(box.collide)).length;
  const elevatedObjectCount = map.boxes.filter(
    (box) => box.y - box.h / 2 > 0.08 && box.pattern !== "pipes" && box.prop !== "painting",
  ).length;
  const metrics: MapGameplayMetrics = {
    width: map.w,
    depth: map.d,
    boxCount: map.boxes.length,
    solidCount: colliders.length,
    propCount,
    primaryCoverCount,
    rotatedColliderCount,
    elevatedObjectCount,
    spawnCount: map.spawns.length,
    hunterSpawnCount: map.hunterSpawns.length,
  };

  if (!Number.isFinite(map.w) || !Number.isFinite(map.d) || map.w <= 0 || map.d <= 0) {
    issues.push(issue("error", "MAP_DIMENSIONS_INVALID", "맵의 가로·세로 크기가 유효하지 않습니다."));
  }
  if (map.w < MIN_MAP_WIDTH || map.w > MAX_MAP_WIDTH || map.d < MIN_MAP_DEPTH || map.d > MAX_MAP_DEPTH) {
    issues.push(
      issue(
        "warning",
        "MAP_SIZE_OUTSIDE_TARGET",
        `8인 기준 초기 목표 크기(${MIN_MAP_WIDTH}~${MAX_MAP_WIDTH} × ${MIN_MAP_DEPTH}~${MAX_MAP_DEPTH})를 벗어납니다.`,
      ),
    );
  }
  if (map.spawns.length < 8) {
    issues.push(issue("error", "HIDER_SPAWNS_TOO_FEW", "최대 8인 라운드를 위한 카멜레온 스폰이 8개보다 적습니다."));
  }
  if (map.hunterSpawns.length < 1) {
    issues.push(issue("error", "HUNTER_SPAWN_MISSING", "술래 스폰이 없습니다."));
  }
  if (primaryCoverCount < 8) {
    issues.push(issue("warning", "PRIMARY_COVER_TOO_SPARSE", "8인 라운드에서 사용할 주요 은신처가 부족합니다."));
  }
  // Baseline: 8 primary covers on a 42x32 arena. Bigger arenas need proportionally more.
  const requiredCover = Math.ceil((8 * map.w * map.d) / (42 * 32));
  if (primaryCoverCount < requiredCover) {
    issues.push(
      issue(
        "warning",
        "COVER_DENSITY_LOW",
        `면적 대비 주요 은신처가 부족합니다 (${primaryCoverCount}/${requiredCover}). 맵을 키웠으면 커버도 늘려야 합니다.`,
      ),
    );
  }
  const propColliders = map.boxes
    .filter((box) => Boolean(box.prop) && Boolean(box.collide))
    .flatMap((box) => mapColliders({ ...map, boxes: [box] }).map((collider) => ({ box, collider })));
  for (let i = 0; i < propColliders.length; i += 1) {
    for (let j = i + 1; j < propColliders.length; j += 1) {
      const a = propColliders[i].collider;
      const b = propColliders[j].collider;
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (overlapX > 0.25 && overlapZ > 0.25) {
        issues.push(
          issue(
            "error",
            "PROP_OVERLAP",
            `소품이 서로 겹칩니다: ${propColliders[i].box.prop}(${a.minX.toFixed(1)}, ${a.minZ.toFixed(1)}) × ${propColliders[j].box.prop}(${b.minX.toFixed(1)}, ${b.minZ.toFixed(1)}).`,
          ),
        );
      }
    }
  }
  if (propCount < 12) {
    issues.push(issue("warning", "SEMANTIC_PROPS_TOO_FEW", "실제 가구·소품 기반의 의미 있는 장애물이 부족합니다."));
  }
  if (elevatedObjectCount > 0) {
    issues.push(
      issue(
        "warning",
        "ELEVATED_GAMEPLAY_OBJECT",
        "바닥·천장 기준이 명확하지 않은 공중 오브젝트가 있습니다.",
      ),
    );
  }

  const points = [...map.spawns.map((point) => ({ ...point, kind: "hider" })), ...map.hunterSpawns.map((point) => ({ ...point, kind: "hunter" }))];
  for (const point of points) {
    if (
      point.x < PLAYER_SPAWN_RADIUS ||
      point.x > map.w - PLAYER_SPAWN_RADIUS ||
      point.z < PLAYER_SPAWN_RADIUS ||
      point.z > map.d - PLAYER_SPAWN_RADIUS
    ) {
      issues.push(
        issue(
          "error",
          "SPAWN_OUT_OF_BOUNDS",
          `${point.kind} 스폰(${point.x.toFixed(2)}, ${point.z.toFixed(2)})이 맵 경계에 너무 가깝습니다.`,
        ),
      );
    }
    if (colliders.some((collider) => containsPoint(collider, point.x, point.z, PLAYER_SPAWN_RADIUS))) {
      issues.push(
        issue(
          "error",
          "SPAWN_BLOCKED",
          `${point.kind} 스폰(${point.x.toFixed(2)}, ${point.z.toFixed(2)})이 충돌 오브젝트와 겹칩니다.`,
        ),
      );
    }
  }
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) < PLAYER_SPAWN_RADIUS * 2.2) {
        issues.push(issue("error", "SPAWN_OVERLAP", "두 스폰 위치가 서로 겹치거나 지나치게 가깝습니다."));
      }
    }
  }
  for (const box of map.boxes) {
    if (!finiteBox(box) || box.w <= 0 || box.h <= 0 || box.d <= 0) {
      issues.push(issue("error", "BOX_INVALID", "크기나 위치가 유효하지 않은 맵 오브젝트가 있습니다."));
      break;
    }
  }

  return { mapId: map.id, metrics, issues };
}

export function auditMaps(maps: GameMap[]): GameplayAuditReport {
  const reports = maps.map(auditMap);
  return { maps: reports, issues: reports.flatMap((report) => report.issues) };
}

export function auditRoomContract(room: RoomState, playerCount: number): GameplayAuditIssue[] {
  const issues: GameplayAuditIssue[] = [];
  if (playerCount > 8) issues.push(issue("error", "PLAYER_LIMIT_EXCEEDED", "방 인원이 최대 8인을 초과했습니다."));
  if (room.phase !== "lobby" && room.hunterIds.length === 0) {
    issues.push(issue("error", "HUNTER_NOT_ASSIGNED", "게임 라운드에 술래가 배정되지 않았습니다."));
  }
  if (room.phase !== "lobby" && room.phaseEndsAt <= 0) {
    issues.push(issue("error", "PHASE_TIMER_MISSING", "진행 중인 페이즈의 종료 시각이 없습니다."));
  }
  if (room.prepareTime <= 0 || room.hideTime <= 0 || room.huntTime <= 0) {
    issues.push(issue("error", "ROUND_TIMER_INVALID", "라운드 시간 설정은 0보다 커야 합니다."));
  }
  if (room.ammoEnabled && room.ammoCount < 1) {
    issues.push(issue("error", "AMMO_CONFIG_INVALID", "탄약 제한을 사용할 때 탄약 수가 1보다 작습니다."));
  }
  return issues;
}
