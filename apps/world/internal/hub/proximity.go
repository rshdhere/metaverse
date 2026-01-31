package hub

import (
	"log"
	"math"
	"time"
)

const (
	ProximityEnter = "enter"
	ProximityLeave = "leave"
)

type ProximityEvent struct {
	Type    string `json:"type"`
	UserA   string `json:"userA"`
	UserB   string `json:"userB"`
	SpaceID string `json:"spaceId,omitempty"`
	Media   string `json:"media,omitempty"`
}



func (s *Space) UpdateProximityForUser(
	user *Client,
	radius float64,
	media string,
) []ProximityEvent {
	if radius <= 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	events := make([]ProximityEvent, 0)
	proximity := s.getProximityMapLocked(media)
	userSet, ok := proximity[user.UserID]
	if !ok {
		userSet = make(map[string]bool)
		proximity[user.UserID] = userSet
	}

	userX, userY := user.GetPosition()
	now := time.Now()

	for otherID, other := range s.Users {
		if otherID == user.UserID {
			continue
		}

		otherX, otherY := other.GetPosition()
		inRange := distance(userX, userY, otherX, otherY) <= radius
		wasInRange := userSet[otherID]

		if inRange {
			if media == "video" {
				// For video, we ONLY manage the dwell start time here.
				// The actual meeting prompt emission is handled by CheckVideoDwellTimers logic (in space.go).
				// We do NOT emit ProximityEnter for video here.
				key := dwellKey(user.UserID, otherID)
				
				// Ensure dwell timer is running if not already "proximate/meeting"
				// Note: space.go logic handles clearing dwell start if meeting is active/prompted.
				// Here we just ensure we start tracking if we entered range.
				if _, hasDwell := s.VideoDwellStart[key]; !hasDwell {
					// Only start dwell if we are not already considered "in proximity" (which happens after meeting start?)
					// Actually, VideoProximity map usage might change. 
					// Let's assume VideoProximity map tracks active video sessions?
					// Or just proximity range?
					// The "VideoProximity" map in space.go seemed to be used for general "in range" tracking.
					// But for video we want explicit Meeting Prompts.
					// So let's purely track Dwell Start here.
					s.VideoDwellStart[key] = now
					log.Printf("Proximity: Started video dwell for %s and %s", user.UserID, otherID)
				}
				
				// We do NOT update userSet (VideoProximity) here. Meeting logic handles that state.
			} else if !wasInRange {
				// For AUDIO, emit enter immediately
				userSet[otherID] = true
				otherSet, ok := proximity[otherID]
				if !ok {
					otherSet = make(map[string]bool)
					proximity[otherID] = otherSet
				}
				otherSet[user.UserID] = true
				events = append(events, ProximityEvent{
					Type:    ProximityEnter,
					UserA:   user.UserID,
					UserB:   otherID,
					SpaceID: s.ID,
					Media:   media,
				})
			}
		}

		if !inRange {
			// Users left proximity range
			if wasInRange {
				delete(userSet, otherID)
				if otherSet, ok := proximity[otherID]; ok {
					delete(otherSet, user.UserID)
				}
				events = append(events, ProximityEvent{
					Type:    ProximityLeave,
					UserA:   user.UserID,
					UserB:   otherID,
					SpaceID: s.ID,
					Media:   media,
				})
			}
			
			if media == "video" {
				// Clear dwell timer if they leave range
				key := dwellKey(user.UserID, otherID)
				delete(s.VideoDwellStart, key)
			}
		}
	}

	return events
}

func (s *Space) getProximityMapLocked(media string) map[string]map[string]bool {
	if media == "video" {
		return s.VideoProximity
	}
	return s.AudioProximity
}

func distance(x1, y1, x2, y2 float64) float64 {
	return math.Hypot(x1-x2, y1-y2)
}
