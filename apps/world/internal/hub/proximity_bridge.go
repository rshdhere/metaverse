package hub

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"world/internal/config"
)

type proximityUpdateRequest struct {
	Secret string           `json:"secret,omitempty"`
	Events []ProximityEvent `json:"events"`
}


func (h *Hub) notifyProximityChanges(events []ProximityEvent) {
	if len(events) == 0 || config.AppConfig == nil {
		return
	}

	log.Printf("Sending %d proximity events to backend: %s", len(events), config.AppConfig.ServerURL)
	for _, e := range events {
		log.Printf("Event: %s %s <-> %s (%s)", e.Type, e.UserA, e.UserB, e.Media)
	}

	payload := map[string]struct {
		Json proximityUpdateRequest `json:"json"`
	}{
		"0": {
			Json: proximityUpdateRequest{
				Secret: config.AppConfig.WorldServerSecret,
				Events: events,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal proximity payload: %v", err)
		return
	}

	go func() {
		client := &http.Client{Timeout: 3 * time.Second}
		targetURL := config.AppConfig.ServerURL+"/mediasoup.proximityUpdate?batch=1"
		log.Printf("Posting to: %s", targetURL)
		
		req, err := http.NewRequest(
			http.MethodPost,
			targetURL,
			bytes.NewReader(body),
		)
		if err != nil {
			log.Printf("Failed to build proximity request: %v", err)
			return
		}

		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Failed to send proximity update: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 300 {
			log.Printf("Proximity update failed with status %d", resp.StatusCode)
		} else {
			log.Printf("Proximity update success: %d", resp.StatusCode)
		}
	}()
}
