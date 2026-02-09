package main

import (
	"log"
	"net/http"

	"world/internal/config"
	"world/internal/hub"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var allowedOrigins = map[string]bool{
	"http://localhost:3001":           true,
	"https://raashed.xyz":             true,
	"https://game.raashed.xyz":        true,
	"https://k8s-game.raashed.xyz": true,
	"https://metaverse.raashed.xyz":   	true,
	"https://k8s-metaverse.raashed.xyz":  true,
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow if origin is in whitelist or empty (same-origin)
		if origin == "" {
			return true
		}
		return allowedOrigins[origin]
	},
}

func main() {
	// Load configuration
	if err := config.Load(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Create and start the hub
	h := hub.NewHub()
	go h.Run()

	// Set up router
	r := mux.NewRouter()

	// WebSocket endpoint
	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(h, w, r)
	})

	// Health check endpoint
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	addr := ":" + config.AppConfig.Port
	log.Printf("world ws-server starting on %s", addr)
	log.Printf("ws endpoint: ws://localhost%s/ws", addr)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// serveWs handles websocket requests from clients
func serveWs(h *hub.Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}

	client := hub.NewClient(h, conn)
	h.Register <- client

	// Start read and write pumps in separate goroutines
	go client.WritePump()
	go client.ReadPump()
}
