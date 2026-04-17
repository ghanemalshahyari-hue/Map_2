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

    };
})();
