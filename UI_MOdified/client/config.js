/**
 * Static application configuration.
 * Loaded first, before identity.js and app.js, so every script can read window.AppConfig.
 */
(function () {
    'use strict';

    window.AppConfig = {

        /** Chat API settings — currentUser is mutated by identity.js after load. */
        CHAT_CONFIG: {
            enabled: true,
            apiBaseUrl: '',        // same origin
            roomId: 'default-ops-room',
            pollIntervalMs: 4000,
            maxMessages: 200,
            currentUser: {
                id: 'planner-1',
                name: 'Planner 1',
                role: 'planner'
            },
            allowedRoles: {
                planner:    { canSend: true,  canRead: true  },
                supervisor: { canSend: true,  canRead: true  },
                viewer:     { canSend: false, canRead: true  }
            }
        },

        /** Leaflet map initial view — consumed by app.js during map initialisation. */
        MAP_DEFAULTS: {
            initialLat:  24.0,
            initialLng:  54.5,
            initialZoom: 8,
            maxZoom:     17,
        },

        /**
         * Flank-zone doctrine presets — consumed by free_draw_signature.js.
         * Each preset gives Front Org / Deep Org depths in km for each echelon.
         * Override `activePreset` (or set window.AppConfig.FLANK_DOCTRINE.activePreset
         * before app.js loads) to change defaults without touching code.
         */
        FLANK_DOCTRINE: {
            activePreset: 'standard',
            presets: {
                light:    { battalion: { front: 5,  deep: 12 }, brigade: { front: 12, deep: 25 } },
                standard: { battalion: { front: 8,  deep: 20 }, brigade: { front: 20, deep: 40 } },
                heavy:    { battalion: { front: 10, deep: 30 }, brigade: { front: 25, deep: 60 } }
            },
            /** Resolves the active preset, falling back to 'standard' if missing. */
            current: function () {
                const p = this.presets[this.activePreset] || this.presets.standard;
                return p;
            }
        },

    };
})();
