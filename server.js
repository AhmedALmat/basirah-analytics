const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const db = new sqlite3.Database("./basirah.db");

function addColumnIfNotExists(columnName, columnType) {
  db.all("PRAGMA table_info(events)", [], (err, columns) => {
    if (err) {
      console.log(err);
      return;
    }

    const exists = columns.some(col => col.name === columnName);

    if (!exists) {
      db.run(`ALTER TABLE events ADD COLUMN ${columnName} ${columnType}`, [], err => {
        if (err) console.log(err);
      });
    }
  });
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      project_id TEXT,
      event_type TEXT,
      page_url TEXT,
      element_text TEXT,

      time_spent INTEGER,
      user_agent TEXT,

      screen_width INTEGER,
      screen_height INTEGER,

      click_x INTEGER,
      click_y INTEGER,

      page_x INTEGER,
      page_y INTEGER,
      page_width INTEGER,
      page_height INTEGER,
      viewport_width INTEGER,
      viewport_height INTEGER,
      scroll_x INTEGER,
      scroll_y INTEGER,

      scroll_depth INTEGER,

      funnel_step TEXT,

      alert_type TEXT,
      alert_message TEXT,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  addColumnIfNotExists("page_x", "INTEGER");
  addColumnIfNotExists("page_y", "INTEGER");
  addColumnIfNotExists("page_width", "INTEGER");
  addColumnIfNotExists("page_height", "INTEGER");
  addColumnIfNotExists("viewport_width", "INTEGER");
  addColumnIfNotExists("viewport_height", "INTEGER");
  addColumnIfNotExists("scroll_x", "INTEGER");
  addColumnIfNotExists("scroll_y", "INTEGER");
});

app.post("/track", (req, res) => {
  const {
    project_id,
    event_type,
    page_url,
    element_text,
    time_spent,
    user_agent,
    screen_width,
    screen_height,
    click_x,
    click_y,
    page_x,
    page_y,
    page_width,
    page_height,
    viewport_width,
    viewport_height,
    scroll_x,
    scroll_y,
    scroll_depth,
    funnel_step,
    alert_type,
    alert_message
  } = req.body;

  db.run(
    `
    INSERT INTO events (
      project_id,
      event_type,
      page_url,
      element_text,
      time_spent,
      user_agent,
      screen_width,
      screen_height,
      click_x,
      click_y,
      page_x,
      page_y,
      page_width,
      page_height,
      viewport_width,
      viewport_height,
      scroll_x,
      scroll_y,
      scroll_depth,
      funnel_step,
      alert_type,
      alert_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      project_id,
      event_type,
      page_url,
      element_text,
      time_spent,
      user_agent,
      screen_width,
      screen_height,
      click_x,
      click_y,
      page_x,
      page_y,
      page_width,
      page_height,
      viewport_width,
      viewport_height,
      scroll_x,
      scroll_y,
      scroll_depth,
      funnel_step,
      alert_type,
      alert_message
    ],
    function (err) {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ success: true });
    }
  );
});

app.delete("/api/events", (req, res) => {
  db.run("DELETE FROM events", [], function (err) {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Failed to clear events" });
    }

    res.json({
      success: true,
      message: "All events cleared"
    });
  });
});

app.get("/api/events", (req, res) => {
  db.all(
    "SELECT * FROM events ORDER BY created_at DESC LIMIT 100",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    }
  );
});

app.get("/api/summary", (req, res) => {
  const summary = {};

  db.get("SELECT COUNT(*) AS total_events FROM events", [], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });

    summary.total_events = row.total_events;

    db.all(
      `
      SELECT page_url, COUNT(*) AS visits
      FROM events
      WHERE event_type = 'page_view'
      GROUP BY page_url
      ORDER BY visits DESC
      LIMIT 5
      `,
      [],
      (err, pages) => {
        if (err) return res.status(500).json({ error: "Database error" });

        summary.top_pages = pages;
        res.json(summary);
      }
    );
  });
});

app.get("/api/insights", (req, res) => {
  const projectId = req.query.project_id || "store_001";
  const insights = {};

  db.all(
    `
    SELECT page_url, COUNT(*) AS exits, AVG(time_spent) AS avg_time_spent
    FROM events
    WHERE project_id = ?
    AND event_type = 'page_exit'
    GROUP BY page_url
    ORDER BY exits DESC
    LIMIT 5
    `,
    [projectId],
    (err, exitPages) => {
      if (err) return res.status(500).json({ error: "Database error" });

      insights.exit_pages = exitPages;

      db.all(
        `
        SELECT page_url, COUNT(*) AS clicks
        FROM events
        WHERE project_id = ?
        AND event_type = 'click'
        GROUP BY page_url
        ORDER BY clicks DESC
        LIMIT 5
        `,
        [projectId],
        (err, clickPages) => {
          if (err) return res.status(500).json({ error: "Database error" });

          insights.click_pages = clickPages;

          db.all(
            `
            SELECT element_text, COUNT(*) AS clicks
            FROM events
            WHERE project_id = ?
            AND event_type = 'click'
            AND element_text IS NOT NULL
            GROUP BY element_text
            ORDER BY clicks DESC
            LIMIT 5
            `,
            [projectId],
            (err, topButtons) => {
              if (err) return res.status(500).json({ error: "Database error" });

              insights.top_buttons = topButtons;

              insights.recommendations = exitPages.map(page => {
                let message = "";

                if (page.avg_time_spent < 10) {
                  message =
                    "المستخدمون يغادرون هذه الصفحة بسرعة. قد تكون غير واضحة أو لا تقدم ما يتوقعه العميل.";
                } else if (page.avg_time_spent > 60) {
                  message =
                    "المستخدمون يقضون وقتًا طويلًا هنا ثم يغادرون. قد تكون الصفحة مربكة أو القرار فيها صعب.";
                } else {
                  message =
                    "هذه الصفحة يظهر منها خروج متكرر. تحتاج مراجعة المحتوى، الأزرار، أو تجربة المستخدم.";
                }

                return {
                  page_url: page.page_url,
                  reason: message
                };
              });

              res.json(insights);
            }
          );
        }
      );
    }
  );
});

app.get("/api/frustration", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT page_url, element_text, COUNT(*) AS rage_clicks
    FROM events
    WHERE project_id = ?
    AND event_type = 'rage_click'
    GROUP BY page_url, element_text
    ORDER BY rage_clicks DESC
    LIMIT 10
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      const totalRageClicks = rows.reduce(
        (sum, row) => sum + row.rage_clicks,
        0
      );

      const recommendations = rows.map(row => {
        let severity = "Low";
        let issue = "";
        let recommendation = "";

        if (row.rage_clicks >= 5) {
          severity = "High";
          issue = "يوجد إحباط مرتفع جدًا لدى المستخدمين على هذا العنصر.";
          recommendation =
            "تحقق من استجابة الزر، سرعة الصفحة، ورسائل النظام بعد الضغط.";
        } else if (row.rage_clicks >= 3) {
          severity = "Medium";
          issue = "المستخدمون يضغطون عدة مرات بسرعة على هذا العنصر.";
          recommendation =
            "قد يكون العنصر غير واضح أو لا يعطي Feedback كافي.";
        } else {
          severity = "Low";
          issue = "تم تسجيل بعض النقرات المتكررة.";
          recommendation = "راقب سلوك المستخدمين على هذا العنصر.";
        }

        return {
          page_url: row.page_url,
          element_text: row.element_text,
          rage_clicks: row.rage_clicks,
          severity,
          issue,
          recommendation
        };
      });

      res.json({
        success: true,
        summary: {
          total_problematic_elements: rows.length,
          total_rage_clicks: totalRageClicks
        },
        rage_clicks: rows,
        recommendations
      });
    }
  );
});

app.get("/api/dead-clicks", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT page_url, element_text, COUNT(*) AS dead_clicks
    FROM events
    WHERE project_id = ?
    AND event_type = 'dead_click'
    GROUP BY page_url, element_text
    ORDER BY dead_clicks DESC
    LIMIT 10
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      const totalDeadClicks = rows.reduce(
        (sum, row) => sum + row.dead_clicks,
        0
      );

      const recommendations = rows.map(row => {
        return {
          page_url: row.page_url,
          element_text: row.element_text,
          dead_clicks: row.dead_clicks,
          issue:
            "المستخدمون يضغطون على هذا العنصر رغم أنه لا يبدو تفاعليًا أو لا يستجيب.",
          recommendation:
            "إذا كان العنصر مهمًا، اجعله قابلًا للنقر. وإذا لم يكن مهمًا، غيّر تصميمه حتى لا يبدو كزر أو رابط."
        };
      });

      res.json({
        success: true,
        summary: {
          total_dead_click_elements: rows.length,
          total_dead_clicks: totalDeadClicks
        },
        dead_clicks: rows,
        recommendations
      });
    }
  );
});

app.get("/api/heatmap", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT
      page_url,
      click_x,
      click_y,
      page_x,
      page_y,
      page_width,
      page_height,
      viewport_width,
      viewport_height,
      scroll_x,
      scroll_y,
      screen_width,
      screen_height,
      COUNT(*) AS clicks
    FROM events
    WHERE project_id = ?
    AND event_type = 'heatmap_click'
    AND (
      (page_x IS NOT NULL AND page_y IS NOT NULL)
      OR
      (click_x IS NOT NULL AND click_y IS NOT NULL)
    )
    GROUP BY
      page_url,
      click_x,
      click_y,
      page_x,
      page_y,
      page_width,
      page_height,
      viewport_width,
      viewport_height,
      scroll_x,
      scroll_y,
      screen_width,
      screen_height
    ORDER BY clicks DESC
    LIMIT 200
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        heatmap_points: rows
      });
    }
  );
});

app.get("/api/funnel", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT funnel_step, COUNT(*) AS total
    FROM events
    WHERE project_id = ?
    AND funnel_step IS NOT NULL
    GROUP BY funnel_step
    ORDER BY total DESC
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      const funnelOrder = ["visit", "add_to_cart", "checkout", "purchase", "contact"];

      const orderedFunnel = funnelOrder.map(step => {
        const found = rows.find(row => row.funnel_step === step);

        return {
          step,
          total: found ? found.total : 0
        };
      });

      res.json({
        success: true,
        funnel: orderedFunnel
      });
    }
  );
});

app.get("/api/alerts", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT alert_type, alert_message, page_url, COUNT(*) AS total
    FROM events
    WHERE project_id = ?
    AND event_type = 'smart_alert'
    GROUP BY alert_type, alert_message, page_url
    ORDER BY total DESC
    LIMIT 20
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        alerts: rows
      });
    }
  );
});

app.get("/api/ai-summary", (req, res) => {
  const projectId = req.query.project_id || "store_001";

  db.all(
    `
    SELECT element_text, time_spent, scroll_depth, page_url, created_at
    FROM events
    WHERE project_id = ?
    AND event_type = 'ai_summary_signal'
    ORDER BY created_at DESC
    LIMIT 20
    `,
    [projectId],
    (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }

      let summary = "لا توجد بيانات كافية بعد لتوليد ملخص ذكي.";

      if (rows.length > 0) {
        const quickExits = rows.filter(row => row.time_spent < 10).length;
        const deepScrolls = rows.filter(row => row.scroll_depth > 70).length;

        if (quickExits > deepScrolls) {
          summary =
            "يوجد عدد ملحوظ من المغادرات السريعة. قد تحتاج الصفحة إلى تحسين العنوان، وضوح القيمة، أو سرعة التحميل.";
        } else if (deepScrolls > quickExits) {
          summary =
            "المستخدمون يقرؤون جزءًا كبيرًا من الصفحة، وهذا يدل على اهتمام جيد. راقب الخطوة التالية مثل الضغط على زر الشراء أو التواصل.";
        } else {
          summary =
            "السلوك العام متوسط. تحتاج إلى جمع بيانات أكثر لفهم أسباب التردد أو المغادرة.";
        }
      }

      res.json({
        success: true,
        summary,
        signals: rows
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Basirah Analytics running on http://localhost:${PORT}`);
});