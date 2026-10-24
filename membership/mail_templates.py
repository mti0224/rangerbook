"""Authored email copy; escaped HTML and plain text, with no remote assets."""
import html
import re


LANGUAGES = {'zh-Hant': 'zh_TW', 'zh_TW': 'zh_TW', 'en': 'en', 'jp': 'jp', 'ja': 'jp', 'th': 'th'}
SUBJECTS = {
    'verify': {'zh_TW': 'LINE Ranger 資料站｜驗證您的電子郵件', 'en': 'LINE Ranger Database | Verify your email',
               'jp': 'LINE Ranger データベース｜メールアドレスの確認', 'th': 'ฐานข้อมูล LINE Ranger | ยืนยันอีเมลของคุณ'},
    'reset': {'zh_TW': 'LINE Ranger 資料站｜重設帳號密碼', 'en': 'LINE Ranger Database | Reset your password',
              'jp': 'LINE Ranger データベース｜パスワードの再設定', 'th': 'ฐานข้อมูล LINE Ranger | รีเซ็ตรหัสผ่านบัญชี'},
    'security': {'zh_TW': 'LINE Ranger 資料站｜帳號安全通知', 'en': 'LINE Ranger Database | Account security notification',
                 'jp': 'LINE Ranger データベース｜アカウントのセキュリティ通知', 'th': 'ฐานข้อมูล LINE Ranger | การแจ้งเตือนความปลอดภัยบัญชี'},
}
VERIFY = {
    'zh_TW': '''您好，{username}：

感謝您註冊 **LINE Ranger 資料站**！

為了確保電子郵件地址正確，並保障您的帳號安全，請點擊下方連結完成電子郵件驗證，以啟用您的帳號。

**【驗證電子郵件】**

{url}

完成驗證後，您就可以返回資料站，使用註冊的帳號與密碼登入。

如果您沒有註冊帳號，請直接忽略此封郵件。

- 為保障您的帳號安全，請勿將驗證連結提供給其他人。
- 如果驗證連結已失效，請返回資料站重新申請驗證信。

感謝您使用 LINE Ranger 資料站！''',
    'en': '''Hello {username},

Thank you for registering with the **LINE Ranger Database**!

To confirm that your email address is correct and protect your account, please use the link below to verify your email and activate your account.

**[Verify email]**

{url}

Once verification is complete, return to the site and sign in with the username and password you registered.

If you did not register an account, please ignore this email.

- To protect your account, do not share this verification link with anyone.
- If the link is no longer valid, return to the site to request another verification email.

Thank you for using the LINE Ranger Database!''',
    'jp': '''{username} 様

**LINE Ranger データベース**にご登録いただき、ありがとうございます。

メールアドレスが正しいことを確認し、アカウントの安全を守るため、以下のリンクからメールアドレスを確認してアカウントを有効にしてください。

**【メールアドレスを確認】**

{url}

確認が完了したら、サイトに戻り、ご登録のユーザー名とパスワードでログインできます。

アカウント登録にお心当たりがない場合は、このメールを無視してください。

- アカウントの安全のため、確認リンクを他の人に共有しないでください。
- リンクが無効になっている場合は、サイトに戻って確認メールを再送信してください。

LINE Ranger データベースをご利用いただき、ありがとうございます。''',
    'th': '''สวัสดี {username}

ขอบคุณที่สมัครบัญชีกับ **ฐานข้อมูล LINE Ranger**!

เพื่อยืนยันว่าที่อยู่อีเมลถูกต้องและรักษาความปลอดภัยของบัญชี โปรดคลิกลิงก์ด้านล่างเพื่อยืนยันอีเมลและเปิดใช้งานบัญชีของคุณ

**【ยืนยันอีเมล】**

{url}

เมื่อยืนยันเรียบร้อยแล้ว คุณสามารถกลับไปยังเว็บไซต์และเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ลงทะเบียนไว้

หากคุณไม่ได้สมัครบัญชี โปรดเพิกเฉยต่ออีเมลฉบับนี้

- เพื่อความปลอดภัยของบัญชี อย่าแชร์ลิงก์ยืนยันนี้กับผู้อื่น
- หากลิงก์ใช้ไม่ได้แล้ว โปรดกลับไปยังเว็บไซต์เพื่อขออีเมลยืนยันอีกครั้ง

ขอบคุณที่ใช้ฐานข้อมูล LINE Ranger!''',
}
RESET = {
    'zh_TW': '''您好，{username}：

我們收到了一筆針對您 **LINE Ranger 資料站**帳號的密碼重設申請。

如果這項操作是由您本人提出，請點擊下方連結，前往設定新的登入密碼。

**【重設帳號密碼】**

{url}

**此密碼重設連結將於寄出後 15 分鐘失效，且僅能使用一次。**

完成密碼重設後，請使用新密碼重新登入資料站。

如果您沒有提出密碼重設申請，請直接忽略此封郵件。您的原有密碼不會因此變更。

- 請勿將密碼重設連結提供給其他人。
- 如果連結已過期或失效，請返回資料站重新申請密碼重設。
- 資料站不會透過任何方式要求您提供密碼或雙重驗證碼。

感謝您使用 LINE Ranger 資料站！''',
    'en': '''Hello {username},

We received a password reset request for your **LINE Ranger Database** account.

If you made this request, please use the link below to set a new sign-in password.

**[Reset account password]**

{url}

**This password reset link expires 15 minutes after sending and can be used only once.**

After resetting your password, sign in to the site again with your new password.

If you did not request a password reset, please ignore this email. Your current password will remain unchanged.

- Do not share this password reset link with anyone.
- If the link has expired or is no longer valid, return to the site to request another password reset.
- The site will never ask you to provide your password or two-factor authentication code through any channel.

Thank you for using the LINE Ranger Database!''',
    'jp': '''{username} 様

**LINE Ranger データベース**のアカウントに対するパスワード再設定の申請を受け付けました。

ご本人による申請の場合は、以下のリンクから新しいログインパスワードを設定してください。

**【パスワードを再設定】**

{url}

**この再設定リンクは送信から15分後に無効となり、一度だけ使用できます。**

再設定が完了したら、新しいパスワードでサイトにログインしてください。

パスワード再設定にお心当たりがない場合は、このメールを無視してください。現在のパスワードが変更されることはありません。

- パスワード再設定リンクを他の人に共有しないでください。
- リンクの有効期限が切れている、または無効な場合は、サイトに戻って再度パスワードの再設定を申請してください。
- 当サイトが、いかなる方法でもパスワードや二段階認証コードの提供を求めることはありません。

LINE Ranger データベースをご利用いただき、ありがとうございます。''',
    'th': '''สวัสดี {username}

เราได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชี **ฐานข้อมูล LINE Ranger** ของคุณ

หากคุณเป็นผู้ส่งคำขอนี้ โปรดคลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านเข้าสู่ระบบใหม่

**【รีเซ็ตรหัสผ่านบัญชี】**

{url}

**ลิงก์รีเซ็ตรหัสผ่านนี้จะหมดอายุภายใน 15 นาทีหลังส่ง และใช้ได้เพียงครั้งเดียวเท่านั้น**

เมื่อรีเซ็ตรหัสผ่านเรียบร้อยแล้ว โปรดเข้าสู่ระบบเว็บไซต์อีกครั้งด้วยรหัสผ่านใหม่

หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน โปรดเพิกเฉยต่ออีเมลฉบับนี้ รหัสผ่านเดิมของคุณจะไม่เปลี่ยนแปลง

- อย่าแชร์ลิงก์รีเซ็ตรหัสผ่านนี้กับผู้อื่น
- หากลิงก์หมดอายุหรือใช้ไม่ได้แล้ว โปรดกลับไปยังเว็บไซต์เพื่อขอรีเซ็ตรหัสผ่านอีกครั้ง
- เว็บไซต์จะไม่ขอให้คุณเปิดเผยรหัสผ่านหรือรหัสยืนยันตัวตนสองขั้นตอนผ่านช่องทางใด ๆ

ขอบคุณที่ใช้ฐานข้อมูล LINE Ranger!''',
}
FOOTERS = {
    'zh_TW': '**LINE Ranger 資料站**\nhttps://rangerbook.warmycat.com/\n\n*此郵件由系統自動發送，請勿直接回覆。*',
    'en': '**LINE Ranger Database**\nhttps://rangerbook.warmycat.com/\n\n*This is an automated email. Please do not reply.*',
    'jp': '**LINE Ranger データベース**\nhttps://rangerbook.warmycat.com/\n\n*このメールは自動送信です。返信はご遠慮ください。*',
    'th': '**ฐานข้อมูล LINE Ranger**\nhttps://rangerbook.warmycat.com/\n\n*อีเมลนี้ส่งโดยระบบอัตโนมัติ โปรดอย่าตอบกลับ*',
}
SECURITY = {
    'zh_TW': '您的 LINE Ranger 資料站帳號安全設定已變更。若非本人操作，請聯絡站長。',
    'en': 'Your LINE Ranger Database account security settings were changed. If this was not you, contact the site owner.',
    'jp': 'LINE Ranger データベースのアカウントのセキュリティ設定が変更されました。お心当たりがない場合は、サイト管理者にご連絡ください。',
    'th': 'การตั้งค่าความปลอดภัยบัญชีฐานข้อมูล LINE Ranger ของคุณมีการเปลี่ยนแปลง หากคุณไม่ได้ดำเนินการ โปรดติดต่อผู้ดูแลเว็บไซต์',
}


def render_email(kind, username='', url='', locale='zh-Hant'):
    locale = LANGUAGES.get(locale, 'zh_TW')
    if kind not in SUBJECTS:
        raise ValueError('Unsupported email kind')
    # Escape substitutions before interpreting authored emphasis. Never treat
    # usernames or URL values as markup (even if old imported data was unusual).
    template = (VERIFY if kind == 'verify' else RESET)[locale] if kind != 'security' else SECURITY[locale]
    body = template.format(username='{USERNAME}', url='{ACTION_URL}') + '\n\n' + FOOTERS[locale]
    text = re.sub(r'\*\*(.*?)\*\*|\*(.*?)\*', lambda m: m[1] or m[2], body)
    text = re.sub(r'\{USERNAME\}|\{ACTION_URL\}', lambda m: username if m[0] == '{USERNAME}' else url, text)
    escaped = html.escape(body)
    escaped = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', escaped)
    escaped = re.sub(r'\*(.*?)\*', r'<em>\1</em>', escaped)
    link = '<a rel="noreferrer" style="overflow-wrap:anywhere;word-break:break-word" href="' + html.escape(url, quote=True) + '">' + html.escape(url) + '</a>'
    escaped = re.sub(r'\{USERNAME\}|\{ACTION_URL\}', lambda m: html.escape(username) if m[0] == '{USERNAME}' else link, escaped)
    blocks = []
    for block in escaped.split('\n\n'):
        lines = block.splitlines()
        if all(line.startswith('- ') for line in lines):
            blocks.append('<ul>' + ''.join('<li>' + line[2:] + '</li>' for line in lines) + '</ul>')
        else:
            blocks.append('<p>' + '<br>'.join(lines) + '</p>')
    language = {'zh_TW': 'zh-Hant', 'jp': 'ja'}.get(locale, locale)
    markup = '<!doctype html><html lang="' + language + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;font-family:Arial,sans-serif;line-height:1.6"><main style="max-width:640px;margin:auto;overflow-wrap:anywhere">' + ''.join(blocks) + '</main></body></html>'
    return {'Subject': {'Data': SUBJECTS[kind][locale], 'Charset': 'UTF-8'},
            'Body': {'Text': {'Data': text, 'Charset': 'UTF-8'}, 'Html': {'Data': markup, 'Charset': 'UTF-8'}}}
