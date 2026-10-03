/*
  LIBRARY BOOKING V5.1
  GitHub Pages + Google Apps Script + Google Sheet.

  Cross-origin strategy:
  - GET /list: JSONP, read-only.
  - POST /book: normal form POST to a hidden iframe.
  - Frontend re-reads /list to verify the authoritative Sheet result.

  Deploy as Web app:
  Execute as: Me
  Who has access: Anyone
*/

const BOOKING_SHEET = "Bookings";

function getBookingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BOOKING_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(BOOKING_SHEET);
    sheet.appendRow([
      "id","date","room","start","end","studentId","createdAt"
    ]);
  }

  return sheet;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(data, callback) {
  const safe = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback || "");

  if (!safe) return jsonResponse(data);

  return ContentService
    .createTextOutput(
      safe + "(" + JSON.stringify(data) + ");"
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doGet(e) {
  try {
    const p = e.parameter || {};
    const action = p.action || "";

    if (action === "list") {
      const date = String(p.date || "");
      const room = Number(p.room);

      return jsonpResponse({
        ok: true,
        bookings: getBookings(date, room)
      }, p.prefix || "");
    }

    return jsonpResponse({
      ok: true,
      message: "Library Booking API is running"
    }, p.prefix || "");

  } catch (error) {
    return jsonpResponse({
      ok: false,
      error: String(error)
    }, e && e.parameter ? e.parameter.prefix : "");
  }
}

function doPost(e) {
  try {
    const p = e.parameter || {};

    if (String(p.action || "") !== "book") {
      return jsonResponse({
        ok: false,
        error: "Unknown action"
      });
    }

    return createBooking(p);

  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error)
    });
  }
}

function getBookings(date, room) {
  const sheet = getBookingSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return [];

  const result = [];

  for (let i=1; i<values.length; i++) {
    const row = values[i];

    if (
      String(row[1]) === String(date) &&
      Number(row[2]) === Number(room)
    ) {
      result.push({
        id: String(row[0]),
        date: String(row[1]),
        room: Number(row[2]),
        start: String(row[3]),
        end: String(row[4]),
        studentId: String(row[5]),
        createdAt: String(row[6])
      });
    }
  }

  return result;
}

function minutes(time) {
  const parts = String(time).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function getRoomConfig(room) {
  room = Number(room);

  if ([1,2,3].includes(room)) {
    return {
      start:"07:30",
      end:"21:00",
      weekdaysOnly:true
    };
  }

  if ([4,5,6,7].includes(room)) {
    return {
      start:"08:00",
      end:"21:15",
      weekdaysOnly:false
    };
  }

  return null;
}

function isAllowedDate(date) {
  const timezone = Session.getScriptTimeZone();
  const now = new Date();

  const today = Utilities.formatDate(
    now, timezone, "yyyy-MM-dd"
  );

  const tomorrow = Utilities.formatDate(
    new Date(now.getTime()+24*60*60*1000),
    timezone,
    "yyyy-MM-dd"
  );

  return date === today || date === tomorrow;
}

function hasOverlap(start,end,bookings) {
  const newStart=minutes(start);
  const newEnd=minutes(end);

  return bookings.some(booking=>{
    const oldStart=minutes(booking.start);
    const oldEnd=minutes(booking.end);

    return newStart < oldEnd && newEnd > oldStart;
  });
}

function createBooking(data) {
  const date=String(data.date||"");
  const room=Number(data.room);
  const start=String(data.start||"");
  const end=String(data.end||"");
  const studentId=String(data.studentId||"").trim();

  if(!studentId)
    return jsonResponse({ok:false,error:"Vui lòng nhập MSSV."});

  if(!isAllowedDate(date))
    return jsonResponse({ok:false,error:"Chỉ được đặt hôm nay hoặc ngày mai."});

  const config=getRoomConfig(room);

  if(!config)
    return jsonResponse({ok:false,error:"Phòng không hợp lệ."});

  const dateObject=new Date(date+"T12:00:00");
  const weekday=dateObject.getDay();

  if(config.weekdaysOnly && (weekday===0 || weekday===6))
    return jsonResponse({
      ok:false,
      error:"Phòng 1-3 chỉ hoạt động từ thứ 2 đến thứ 6."
    });

  const startMinutes=minutes(start);
  const endMinutes=minutes(end);

  if(
    startMinutes < minutes(config.start) ||
    endMinutes > minutes(config.end) ||
    endMinutes <= startMinutes
  )
    return jsonResponse({
      ok:false,
      error:"Khung giờ không hợp lệ."
    });

  if(endMinutes-startMinutes>120)
    return jsonResponse({
      ok:false,
      error:"Mỗi lượt sử dụng tối đa 2 giờ."
    });

  const timezone=Session.getScriptTimeZone();
  const now=new Date();

  const today=Utilities.formatDate(
    now,timezone,"yyyy-MM-dd"
  );

  if(date===today){
    const current=
      Number(Utilities.formatDate(now,timezone,"HH"))*60+
      Number(Utilities.formatDate(now,timezone,"mm"));

    if(startMinutes<=current)
      return jsonResponse({
        ok:false,
        error:"Giờ bắt đầu phải ở tương lai."
      });
  }

  const lock=LockService.getScriptLock();
  lock.waitLock(10000);

  try{
    const existing=getBookings(date,room);

    if(hasOverlap(start,end,existing))
      return jsonResponse({
        ok:false,
        error:"Khung giờ vừa được người khác đặt. Vui lòng cập nhật lại."
      });

    const id=Utilities.getUuid();
    const createdAt=new Date().toISOString();

    getBookingSheet().appendRow([
      id,date,room,start,end,studentId,createdAt
    ]);

    return jsonResponse({
      ok:true,
      booking:{
        id,date,room,start,end,studentId,createdAt
      }
    });

  }finally{
    lock.releaseLock();
  }
}
