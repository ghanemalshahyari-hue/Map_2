/**
 * Coordinate system utilities - format and parse military coordinate systems
 * WGS84 Decimal, DMS, UTM, MGRS
 */
(function (global) {
    'use strict';

    function toRad(d) { return d * Math.PI / 180; }
    function toDeg(r) { return r * 180 / Math.PI; }

    function latLngToDMS(lat, lng) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lngDir = lng >= 0 ? 'E' : 'W';
        const latAbs = Math.abs(lat);
        const lngAbs = Math.abs(lng);
        const latD = Math.floor(latAbs);
        const latM = Math.floor((latAbs - latD) * 60);
        const latS = ((latAbs - latD - latM / 60) * 3600).toFixed(1);
        const lngD = Math.floor(lngAbs);
        const lngM = Math.floor((lngAbs - lngD) * 60);
        const lngS = ((lngAbs - lngD - lngM / 60) * 3600).toFixed(1);
        return latD + '\u00B0' + latM + "'" + latS + '"' + latDir + ' ' + lngD + '\u00B0' + lngM + "'" + lngS + '"' + lngDir;
    }

    function parseDMS(str) {
        const m = str.trim().match(/^(-?\d+)[\u00B0\s]*(\d+)[\'\u2032\s]*([\d.]+)[\u201D"\u2033]?\s*([NS])\s*(-?\d+)[\u00B0\s]*(\d+)[\'\u2032\s]*([\d.]+)[\u201D"\u2033]?\s*([EW])/i)
            || str.trim().match(/^(-?\d+)\s+(\d+)\s+([\d.]+)\s*([NS])\s*(-?\d+)\s+(\d+)\s+([\d.]+)\s*([EW])/i);
        if (!m) return null;
        let lat = parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseFloat(m[3]) / 3600;
        let lng = parseInt(m[5], 10) + parseInt(m[6], 10) / 60 + parseFloat(m[7]) / 3600;
        if (m[4].toUpperCase() === 'S') lat = -lat;
        if (m[8].toUpperCase() === 'W') lng = -lng;
        return { lat, lng };
    }

    function latLngToUTM(lat, lng) {
        if (lat < -80 || lat > 84) return null;
        let zone = Math.floor((lng + 180) / 6) + 1;
        if (lng === 180) zone = 60;
        const lon0 = (zone - 1) * 6 - 180 + 3;
        const k0 = 0.9996;
        const a = 6378137;
        const f = 1 / 298.257223563;
        const e = Math.sqrt(f * (2 - f));
        const n = f / (2 - f);
        const n2 = n * n, n3 = n * n2, n4 = n * n3, n5 = n * n4, n6 = n * n5;
        const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
        const phi = toRad(lat);
        const lambda = toRad(lng - lon0);
        const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
        const tau = tanPhi;
        const sigma = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau)));
        const tauP = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
        const xiP = Math.atan2(tauP, cosPhi);
        const etaP = Math.asinh(Math.sin(lambda) / Math.sqrt(tauP * tauP + cosPhi * cosPhi));
        const alpha = [null, n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180 - 127 * n5 / 288 + 7891 * n6 / 37800,
            13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440 + 281 * n5 / 630 - 1983433 * n6 / 1935360,
            61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440,
            49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600,
            34729 * n5 / 80640 - 3418889 * n6 / 1995840, 212378941 * n6 / 319334400];
        let xi = xiP, eta = etaP;
        for (let j = 1; j <= 6; j++) {
            xi += alpha[j] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
            eta += alpha[j] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
        }
        let x = k0 * A * eta + 500000;
        let y = k0 * A * xi;
        const hem = lat >= 0 ? 'N' : 'S';
        if (lat < 0) y += 10000000;
        return zone + ' ' + hem + ' ' + Math.round(x) + ' ' + Math.round(y);
    }

    function parseUTM(str) {
        const m = str.trim().match(/^(\d{1,2})\s*([NS])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i)
            || str.trim().match(/^(\d{1,2})\s*([A-Z])\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
        if (!m) return null;
        const zone = parseInt(m[1], 10);
        let hem = m[2].toUpperCase();
        const easting = parseFloat(m[3]);
        const northing = parseFloat(m[4]);
        if (zone < 1 || zone > 60) return null;
        if (hem !== 'N' && hem !== 'S') hem = northing < 1e7 ? 'N' : 'S';
        const lon0 = (zone - 1) * 6 - 180 + 3;
        const k0 = 0.9996;
        const a = 6378137;
        const f = 1 / 298.257223563;
        const e = Math.sqrt(f * (2 - f));
        const n = f / (2 - f);
        const n2 = n * n, n3 = n * n2, n4 = n * n3, n5 = n * n4, n6 = n * n5;
        const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
        const x = (easting - 500000) / (k0 * A);
        let y = northing;
        if (hem === 'S') y -= 10000000;
        const eta = x;
        const xi = y / (k0 * A);
        const beta = [null, n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800,
            n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720,
            17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720,
            4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600,
            4583 * n5 / 161280 - 108847 * n6 / 3991680, 20648693 * n6 / 638668800];
        let xiP = xi, etaP = eta;
        for (let j = 1; j <= 6; j++) {
            xiP -= beta[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
            etaP -= beta[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
        }
        const sinXi = Math.sin(xiP), cosXi = Math.cos(xiP), sinhEta = Math.sinh(etaP);
        let tau = sinXi / Math.sqrt(sinhEta * sinhEta + cosXi * cosXi);
        for (let i = 0; i < 5; i++) {
            const sigma = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau)));
            const tauP = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
            tau = sinXi / Math.sqrt(sinhEta * sinhEta + cosXi * cosXi) * Math.sqrt(1 + tauP * tauP) - tauP;
        }
        const phi = Math.atan(tau);
        const lambda = Math.atan2(sinhEta, cosXi) + toRad(lon0);
        return { lat: toDeg(phi), lng: toDeg(lambda) };
    }

    function formatCoords(lat, lng, system) {
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return '—';
        switch (system) {
            case 'dms': return latLngToDMS(lat, lng);
            case 'utm': return latLngToUTM(lat, lng) || (lat.toFixed(6) + '\u00B0, ' + lng.toFixed(6) + '\u00B0');
            case 'mgrs':
                try {
                    if (typeof global.mgrs !== 'undefined' && global.mgrs.forward) {
                        return global.mgrs.forward([lng, lat], 5);
                    }
                } catch (err) { }
                return lat.toFixed(6) + '\u00B0, ' + lng.toFixed(6) + '\u00B0';
            case 'wgs84':
            default: return lat.toFixed(6) + '\u00B0, ' + lng.toFixed(6) + '\u00B0';
        }
    }

    function parseCoords(str, system) {
        if (!str || typeof str !== 'string') return null;
        const s = str.trim();
        if (!s) return null;
        switch (system) {
            case 'dms':
                return parseDMS(s);
            case 'utm':
                return parseUTM(s);
            case 'mgrs':
                try {
                    if (typeof global.mgrs !== 'undefined' && global.mgrs.toPoint) {
                        const pt = global.mgrs.toPoint(s);
                        return pt ? { lat: pt[1], lng: pt[0] } : null;
                    }
                } catch (err) { }
                return null;
            case 'wgs84':
            default: {
                const parts = s.split(/[\s,;]+/).map(p => parseFloat(p.replace(/[^\d.-]/g, '')));
                if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    const lat = parts[0], lng = parts[1];
                    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
                }
                return null;
            }
        }
    }

    function getCoordInputLabels(system) {
        switch (system) {
            case 'dms': return { primary: 'DMS', secondary: null };
            case 'utm': return { primary: 'UTM', secondary: null };
            case 'mgrs': return { primary: 'MGRS', secondary: null };
            default: return { primary: 'Lat', secondary: 'Lng' };
        }
    }

    global.CoordUtils = {
        format: formatCoords,
        parse: parseCoords,
        getInputLabels: getCoordInputLabels,
        systems: ['wgs84', 'dms', 'utm', 'mgrs']
    };
})(typeof window !== 'undefined' ? window : this);
