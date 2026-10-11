import Intents
import UserNotifications

/// Runs for every staff push (the backend marks them mutable) and:
///  - tells the server the push reached this phone (`receipt`, a signed link)
///    — that is the "Arrived · 2 s" in the operator app's Push log;
///  - shows a push from a driver as a message from that driver — their photo
///    and name in place of the Mercon icon, the way WhatsApp shows a contact
///    (iOS "Communication Notifications"), from `sender` ({ id, name, image }).
/// Anything missing — no sender, no photo, no network — shows the push as it came.
class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    lock.lock()
    self.contentHandler = contentHandler
    self.original = request.content
    lock.unlock()

    // Expo puts the push's `data` under "body".
    guard let data = request.content.userInfo["body"] as? [String: Any] else {
      return finish(request.content)
    }
    let group = DispatchGroup()
    var shown: UNNotificationContent = request.content

    if let receipt = data["receipt"] as? String {
      group.enter()
      reportArrival(receipt) { group.leave() }
    }
    if let sender = data["sender"] as? [String: Any], let name = sender["name"] as? String, !name.isEmpty {
      group.enter()
      asMessage(from: sender, name: name, request: request) { content in
        shown = content
        group.leave()
      }
    }
    group.notify(queue: .global()) { self.finish(shown) }
  }

  /// The push as a message from the driver (falls back to the push as it came).
  private func asMessage(
    from sender: [String: Any],
    name: String,
    request: UNNotificationRequest,
    completion: @escaping (UNNotificationContent) -> Void
  ) {
    let senderId = (sender["id"] as? String) ?? name
    loadImage(sender["image"] as? String) { imageData in
      let image = imageData.map { INImage(imageData: $0) }
      let person = INPerson(
        personHandle: INPersonHandle(value: senderId, type: .unknown),
        nameComponents: nil,
        displayName: name,
        image: image,
        contactIdentifier: nil,
        customIdentifier: senderId
      )
      // One conversation per driver, so iOS groups each driver's updates.
      let intent = INSendMessageIntent(
        recipients: nil,
        outgoingMessageType: .outgoingMessageText,
        content: request.content.body,
        speakableGroupName: nil,
        conversationIdentifier: "driver-\(senderId)",
        serviceName: nil,
        sender: person,
        attachments: nil
      )
      if let image { intent.setImage(image, forParameterNamed: \.sender) }

      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        completion((try? request.content.updating(from: intent)) ?? request.content)
      }
    }
  }

  /// "It arrived" — best effort; the push is shown whether or not this gets through.
  private func reportArrival(_ link: String, completion: @escaping () -> Void) {
    guard let url = URL(string: link), url.scheme == "https" else { return completion() }
    var request = URLRequest(url: url, timeoutInterval: 8)
    request.httpMethod = "POST"
    URLSession.shared.dataTask(with: request) { _, _, _ in completion() }.resume()
  }

  /// iOS is about to give up on us (~30 s): show the push as it came.
  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let content = original
    lock.unlock()
    if let content { finish(content) }
  }

  /// Hands the content to iOS exactly once, whichever path gets there first.
  private func finish(_ content: UNNotificationContent) {
    lock.lock()
    let handler = contentHandler
    contentHandler = nil
    lock.unlock()
    handler?(content)
  }

  /// The driver's photo — a signed link from the API, so no sign-in is needed.
  private func loadImage(_ link: String?, completion: @escaping (Data?) -> Void) {
    guard let link, let url = URL(string: link), url.scheme == "https" else {
      return completion(nil)
    }
    let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 10)
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let ok = (response as? HTTPURLResponse)?.statusCode == 200
      completion(ok ? data : nil)
    }.resume()
  }
}
