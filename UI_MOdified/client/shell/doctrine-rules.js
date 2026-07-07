/* ============================================================================
 * doctrine-rules.js - DOC1 Doctrine / ROE / WRA pure evaluator
 * ----------------------------------------------------------------------------
 * Read-only foundation only. No DOM, no backend, no map, no journal, no unit or
 * scenario mutation. Runtime/effects wiring is deferred to DOC2.
 * ========================================================================== */
(function (root) {
    'use strict';

    var DECISION_RANK = { allow: 0, require_approval: 1, block: 2 };
    var SEVERITY_RANK = { info: 0, warn: 1, critical: 2 };
    var SENSOR_RANK = { none: 0, low: 1, degraded: 1, medium: 2, med: 2, high: 3, excellent: 4 };

    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    function str(v) { return (v == null) ? '' : String(v); }
    function lower(v) { return str(v).toLowerCase(); }
    function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

    function normDecision(v, fallback) {
        var d = lower(v || fallback || 'allow');
        return hasOwn(DECISION_RANK, d) ? d : 'allow';
    }
    function normSeverity(v, fallback) {
        var s = lower(v || fallback || 'info');
        return hasOwn(SEVERITY_RANK, s) ? s : 'info';
    }
    function asList(v) {
        if (v == null) return [];
        return Array.isArray(v) ? v.map(str).filter(Boolean) : [str(v)].filter(Boolean);
    }
    function includesAny(ruleValues, value) {
        var list = asList(ruleValues).map(lower);
        if (!list.length) return true;
        if (Array.isArray(value)) {
            var vals = value.map(lower);
            return list.some(function (x) { return vals.indexOf(x) !== -1; });
        }
        return list.indexOf(lower(value)) !== -1;
    }
    function enabled(rule) { return obj(rule).enabled !== false; }
    function baseRule(rule, kind, i) {
        var r = obj(rule);
        return {
            id: str(r.id || (kind + '-' + (i + 1))),
            enabled: r.enabled !== false,
            decision: normDecision(r.decision, 'allow'),
            severity: normSeverity(r.severity, r.decision === 'block' ? 'critical' : 'warn'),
            reason: str(r.reason || r.description || r.id || kind),
            requires_authority: r.requires_authority || r.required_authority || null,
            tags: asList(r.tags),
            raw: clone(r)
        };
    }

    function normalizeDoctrineRules(scenario) {
        return arr(obj(scenario).doctrine_rules).map(function (rule, i) {
            var r = obj(rule), b = baseRule(r, 'doctrine', i);
            b.applies_to_side = r.applies_to_side || r.side || null;
            b.applies_to_unit_ids = asList(r.applies_to_unit_ids || r.unit_ids);
            b.applies_to_domains = asList(r.applies_to_domains || r.domains);
            b.applies_to_weapon_classes = asList(r.applies_to_weapon_classes || r.weapon_classes);
            b.condition = r.condition || null;
            b.action = r.action || r.action_kind || null;
            return b;
        });
    }
    function normalizeRoeRules(scenario) {
        return arr(obj(scenario).roe_rules).map(function (rule, i) {
            var r = obj(rule), b = baseRule(r, 'roe', i);
            b.target_domain = r.target_domain || null;
            b.target_status = r.target_status || null;
            b.hostile_confirmed_required = r.hostile_confirmed_required === true;
            b.collateral_risk_max = isFinite(+r.collateral_risk_max) ? +r.collateral_risk_max : null;
            b.restricted_area_ids = asList(r.restricted_area_ids);
            return b;
        });
    }
    function normalizeWraRules(scenario) {
        return arr(obj(scenario).wra_rules).map(function (rule, i) {
            var r = obj(rule), b = baseRule(r, 'wra', i);
            b.weapon_class = r.weapon_class || null;
            b.target_class = r.target_class || r.target_domain || null;
            b.max_range_nm = isFinite(+r.max_range_nm) ? +r.max_range_nm : null;
            b.min_confidence = isFinite(+r.min_confidence) ? +r.min_confidence : null;
            b.required_sensor_quality = r.required_sensor_quality || null;
            b.salvo_limit = isFinite(+r.salvo_limit) ? +r.salvo_limit : null;
            return b;
        });
    }

    function actionMatches(rule, ctx) {
        ctx = obj(ctx);
        if (!enabled(rule)) return false;
        if (rule.applies_to_side && lower(rule.applies_to_side) !== lower(ctx.side)) return false;
        if (rule.applies_to_unit_ids.length && !includesAny(rule.applies_to_unit_ids, ctx.actor_unit_id)) return false;
        if (rule.applies_to_domains.length && !includesAny(rule.applies_to_domains, ctx.target_domain || ctx.domain)) return false;
        if (rule.applies_to_weapon_classes.length && !includesAny(rule.applies_to_weapon_classes, ctx.weapon_class)) return false;
        if (rule.action && lower(rule.action) !== lower(ctx.action_kind)) return false;
        return conditionMatches(rule.condition, ctx);
    }
    function conditionMatches(condition, ctx) {
        if (!condition) return true;
        if (typeof condition === 'string') return lower(condition) === lower(ctx.action_kind || ctx.condition || condition);
        var c = obj(condition);
        for (var k in c) {
            if (!hasOwn(c, k)) continue;
            if (lower(c[k]) !== lower(ctx[k])) return false;
        }
        return true;
    }
    function roeMatches(rule, ctx) {
        ctx = obj(ctx);
        if (!enabled(rule)) return false;
        if (rule.target_domain && lower(rule.target_domain) !== lower(ctx.target_domain)) return false;
        if (rule.target_status && lower(rule.target_status) !== lower(ctx.target_status)) return false;
        if (rule.hostile_confirmed_required && !isHostileConfirmed(ctx)) return true;
        if (rule.collateral_risk_max != null && isFinite(+ctx.collateral_risk) && +ctx.collateral_risk > rule.collateral_risk_max) return true;
        if (rule.restricted_area_ids.length && includesAny(rule.restricted_area_ids, ctx.area_id)) return true;
        return !(rule.hostile_confirmed_required || rule.collateral_risk_max != null || rule.restricted_area_ids.length);
    }
    function isHostileConfirmed(ctx) {
        if (ctx.hostile_confirmed === true) return true;
        var st = lower(ctx.target_status);
        return st === 'hostile_confirmed' || st === 'confirmed_hostile';
    }
    function wraMatches(rule, ctx) {
        ctx = obj(ctx);
        if (!enabled(rule)) return false;
        if (rule.weapon_class && lower(rule.weapon_class) !== lower(ctx.weapon_class)) return false;
        if (rule.target_class && lower(rule.target_class) !== lower(ctx.target_class || ctx.target_domain)) return false;
        if (rule.max_range_nm != null && isFinite(+ctx.range_nm) && +ctx.range_nm > rule.max_range_nm) return true;
        if (rule.min_confidence != null && isFinite(+ctx.confidence) && +ctx.confidence < rule.min_confidence) return true;
        if (rule.required_sensor_quality && sensorRank(ctx.sensor_quality || ctx.required_sensor_quality) < sensorRank(rule.required_sensor_quality)) return true;
        if (rule.salvo_limit != null && isFinite(+ctx.salvo_count) && +ctx.salvo_count > rule.salvo_limit) return true;
        return !(rule.max_range_nm != null || rule.min_confidence != null || rule.required_sensor_quality || rule.salvo_limit != null);
    }
    function sensorRank(v) {
        var k = lower(v || 'none');
        return hasOwn(SENSOR_RANK, k) ? SENSOR_RANK[k] : 0;
    }

    function resultFromRule(rule, kind) {
        return {
            decision: rule.decision,
            reasons: [rule.reason],
            matched_rules: [{ id: rule.id, kind: kind, decision: rule.decision, severity: rule.severity, reason: rule.reason }],
            required_authority: rule.requires_authority || null,
            severity: rule.severity
        };
    }
    function defaultResult(decision, reason) {
        return { decision: decision, reasons: [reason], matched_rules: [], required_authority: null, severity: decision === 'allow' ? 'info' : 'warn' };
    }
    function combine(results, fallback) {
        var out = defaultResult(fallback.decision, fallback.reason);
        arr(results).forEach(function (r) {
            if (!r) return;
            if (DECISION_RANK[r.decision] > DECISION_RANK[out.decision]) out.decision = r.decision;
            if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[out.severity]) out.severity = r.severity;
            out.reasons = out.reasons.concat(arr(r.reasons));
            out.matched_rules = out.matched_rules.concat(arr(r.matched_rules));
            if (!out.required_authority && r.required_authority) out.required_authority = r.required_authority;
        });
        if (out.matched_rules.length) out.reasons = out.reasons.filter(function (x) { return x !== fallback.reason; });
        return out;
    }

    function evaluateDoctrineForAction(scenario, actionContext, runtimeState) {
        void runtimeState;
        var matches = normalizeDoctrineRules(scenario).filter(function (r) { return actionMatches(r, actionContext); }).map(function (r) { return resultFromRule(r, 'doctrine'); });
        return combine(matches, { decision: 'allow', reason: 'no doctrine rule matched' });
    }
    function evaluateRoeForEngagement(scenario, engagementContext, runtimeState) {
        void runtimeState;
        var matches = normalizeRoeRules(scenario).filter(function (r) { return roeMatches(r, engagementContext); }).map(function (r) { return resultFromRule(r, 'roe'); });
        return combine(matches, { decision: 'allow', reason: 'no ROE rule matched' });
    }
    function evaluateWraForWeaponRelease(scenario, weaponContext, runtimeState) {
        void runtimeState;
        var rules = normalizeWraRules(scenario);
        if (!rules.length) return defaultResult('require_approval', 'no WRA rule configured for weapon release');
        var matches = rules.filter(function (r) { return wraMatches(r, weaponContext); }).map(function (r) { return resultFromRule(r, 'wra'); });
        return combine(matches, { decision: 'allow', reason: 'no WRA rule matched' });
    }
    function buildDoctrineDecisionSummary(results) {
        return combine(arr(results), { decision: 'allow', reason: 'no doctrine/ROE/WRA rule matched' });
    }

    var API = {
        DOC1_VERSION: '1.0.0-doc1-doctrine-rules',
        normalizeDoctrineRules: normalizeDoctrineRules,
        normalizeRoeRules: normalizeRoeRules,
        normalizeWraRules: normalizeWraRules,
        evaluateDoctrineForAction: evaluateDoctrineForAction,
        evaluateRoeForEngagement: evaluateRoeForEngagement,
        evaluateWraForWeaponRelease: evaluateWraForWeaponRelease,
        buildDoctrineDecisionSummary: buildDoctrineDecisionSummary
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.AppDoctrineRules = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
