package hub

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

// Client represents a single WebSocket connection
type Client struct {
	Hub     *Hub
	Conn    *websocket.Conn
	Send    chan []byte
	UserID  string
	Role    string
	SpaceID    string
	X          float64
	Y          float64
	Name       string
	AvatarName string
	Anim       string
	mu         sync.Mutex
}

// NewClient creates a new client instance
func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		Hub:  hub,
		Conn: conn,
		Send: make(chan []byte, 256),
	}
}

// SetPosition updates the client's position
func (c *Client) SetPosition(x, y float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.X = x
	c.Y = y
}

// GetPosition returns the client's current position
func (c *Client) GetPosition() (float64, float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.X, c.Y
}

// ReadPump pumps messages from the WebSocket connection to the hub
// This implements the "fan-in" pattern - all client messages flow into the hub
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Process the message through the hub
		c.Hub.ProcessMessage(c, message)
	}
}

// WritePump pumps messages from the hub to the WebSocket connection
// This implements the "fan-out" pattern - messages from hub go to individual clients
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendJSON sends a JSON-encoded message to the client
func (c *Client) SendJSON(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.Send <- data
	return nil
}
